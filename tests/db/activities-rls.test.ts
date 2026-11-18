// T-01 (part 2): the policies, guard triggers and functions of activities and participants, and
// the limited view, for every role (spec section 3 matrix, section 5 limited view; ADR-0019
// "Access"). Pattern: tests/db/working-groups-rls.test.ts. Task rules: tests/db/tasks-rls.test.ts;
// constraints and the General activity triggers: tests/db/activities-schema.test.ts.
import { afterAll, describe, expect, it } from 'vitest'
import {
  canArchiveActivity,
  canCreateInGroup,
  canEditActivity,
  participantRoleFor,
} from '@/lib/domain/activities'
import { actAs, inRolledBackTransaction, isDenied, sql } from './helpers/db'
import {
  activityWorld,
  addActivity,
  addParticipant,
  editsAsCreator,
  errorCodeOf,
} from './helpers/activities'
import { actor, addGroup, addToGroup, as, ROLES, rowsChanged } from './helpers/groups'
import { addAuthUser, addMember } from './helpers/members'

afterAll(async () => {
  await sql.end({ timeout: 2 })
})

describe('policy helpers', () => {
  const combos = (['new', 'fresh', 'experienced'] as const).flatMap((level) =>
    [false, true].flatMap((isAdmin) =>
      [false, true].flatMap((isMember) =>
        [false, true].flatMap((isCreator) =>
          [false, true].map((isLead) => ({ level, isAdmin, isMember, isCreator, isLead })),
        ),
      ),
    ),
  )

  it.each(combos)(
    'agree with lib/domain/activities.ts for level $level, admin $isAdmin, member $isMember, creator $isCreator, lead $isLead',
    (combo) =>
      inRolledBackTransaction(async (tx) => {
        const group = await addGroup(tx)
        const me = await addMember(tx, { level: combo.level, isAdmin: combo.isAdmin })
        if (combo.isMember) await addToGroup(tx, group, me)
        const activity = await addActivity(tx, group, {
          createdBy: combo.isCreator ? me : undefined,
        })
        if (combo.isLead) {
          await addParticipant(tx, activity, me)
          await tx`update public.activities set lead_id = ${me} where id = ${activity}`
        }
        await as(tx, me)
        const [row] = await tx`
          select public.can_create_in_group(${group}) as "create",
            public.can_edit_activity(${activity}) as edit,
            public.can_archive_activity(${activity}) as archive,
            public.activity_group(${activity}) = ${group} as "groupOf"`
        expect(row).toEqual({
          create: canCreateInGroup(combo),
          edit: canEditActivity(combo),
          archive: canArchiveActivity(combo),
          groupOf: true,
        })
        const joinsAsParticipant = !(await isDenied(
          tx,
          () => tx`select public.join_activity(${activity}, 'participant')`,
        ))
        expect(joinsAsParticipant).toBe(
          (combo.isAdmin || combo.isMember) &&
            participantRoleFor(combo.level, combo.isAdmin).includes('participant'),
        )
      }),
  )

  it('give a deactivated creator, lead or admin no rights', () =>
    inRolledBackTransaction(async (tx) => {
      const group = await addGroup(tx)
      const member = await addMember(tx, { level: 'experienced', status: 'deactivated' })
      const admin = await addMember(tx, { isAdmin: true, status: 'deactivated' })
      await addToGroup(tx, group, member)
      const activity = await addActivity(tx, group, { createdBy: member })
      await addParticipant(tx, activity, member)
      await tx`update public.activities set lead_id = ${member} where id = ${activity}`
      for (const id of [member, admin]) {
        await as(tx, id)
        const [row] = await tx`
          select public.can_create_in_group(${group}) as "create",
            public.can_edit_activity(${activity}) as edit,
            public.can_archive_activity(${activity}) as archive`
        expect(row).toEqual({ create: false, edit: false, archive: false })
      }
    }))

  it('deny anon every function', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      await actAs(tx, { role: 'anon' })
      for (const [fn, args] of [
        ['activity_group', [w.activity]],
        ['can_create_in_group', [w.group]],
        ['can_edit_activity', [w.activity]],
        ['can_archive_activity', [w.activity]],
        ['list_group_activities', [w.group]],
        ['leave_activity', [w.activity]],
      ] as const) {
        expect(await isDenied(tx, () => tx.unsafe(`select public.${fn}($1)`, [...args]))).toBe(true)
      }
      expect(
        await isDenied(tx, () => tx`select public.join_activity(${w.activity}, 'observer')`),
      ).toBe(true)
      expect(
        await isDenied(tx, () => tx`select public.set_activity_lead(${w.activity}, null)`),
      ).toBe(true)
    }))
})

describe('reading', () => {
  it.each(ROLES)(
    '$name reads activities, participants and tasks only as a member or admin',
    (role) =>
      inRolledBackTransaction(async (tx) => {
        const w = await activityWorld(tx)
        await as(tx, w.ids[role.name])
        const a = actor(role)
        const sees = a.isAdmin || a.isMember
        // Archived activities only for those who may archive them: here the experienced member
        // and admins (the archived activity has no creator).
        const seesArchived = a.isAdmin || (a.isMember && role.level === 'experienced')
        const activities = await tx`select id from public.activities where group_id = ${w.group}`
        const participants = await tx`
          select user_id from public.activity_participants where activity_id = ${w.activity}`
        const tasks = await tx`select id from public.tasks where group_id = ${w.group}`
        expect(activities.length).toBe(sees ? (seesArchived ? 4 : 3) : 0)
        expect(participants.length).toBe(sees ? 1 : 0)
        expect(tasks.length).toBe(sees ? 2 : 0)
      }),
  )

  it('shows an archived activity to its creator but not to another fresh member', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      await tx`update public.activities set archived_at = now() where id = ${w.activity}`
      await as(tx, w.fresh)
      expect((await tx`select 1 from public.activities where id = ${w.activity}`).length).toBe(1)
      await as(tx, w.otherFresh)
      expect((await tx`select 1 from public.activities where id = ${w.activity}`).length).toBe(0)
    }))

  it('denies anon every table', () =>
    inRolledBackTransaction(async (tx) => {
      await activityWorld(tx)
      await actAs(tx, { role: 'anon' })
      for (const table of ['activities', 'activity_participants', 'tasks']) {
        expect(await isDenied(tx, () => tx.unsafe(`select * from public.${table}`))).toBe(true)
      }
    }))
})

describe('list_group_activities (limited view)', () => {
  it.each(ROLES)('$name gets titles and statuses only, as an active member', (role) =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      await as(tx, w.ids[role.name])
      const rows = await tx`select * from public.list_group_activities(${w.group})`
      const active = role.status !== 'deactivated'
      // Members and non-members alike; admins also get the archived activity.
      expect(rows.length).toBe(!active ? 0 : actor(role).isAdmin ? 4 : 3)
      if (rows.length > 0) {
        expect(Object.keys(rows[0] as object).sort()).toEqual([
          'archived',
          'id',
          'is_general',
          'key_activity',
          'status',
          'title',
          'type',
        ])
        expect(rows[0]).toMatchObject({ id: w.general, is_general: true, title: 'General' })
      }
    }),
  )

  it('returns nothing about an archived group except to admins, flagged as archived', () =>
    inRolledBackTransaction(async (tx) => {
      const group = await addGroup(tx, { archived: true })
      const member = await addMember(tx, { level: 'experienced' })
      const admin = await addMember(tx, { isAdmin: true })
      await addToGroup(tx, group, member)
      await as(tx, member)
      expect((await tx`select * from public.list_group_activities(${group})`).length).toBe(0)
      await as(tx, admin)
      const rows = await tx`select archived from public.list_group_activities(${group})`
      expect(rows.map((row) => row.archived)).toEqual([true])
    }))

  it('serves an active member outside the group, but not someone signed in who was never approved', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      const stranger = await addAuthUser(tx)
      await as(tx, w.requester)
      expect((await tx`select * from public.list_group_activities(${w.group})`).length).toBe(3)
      await as(tx, stranger)
      expect((await tx`select * from public.list_group_activities(${w.group})`).length).toBe(0)
    }))
})

describe('creating activities', () => {
  it.each(ROLES)('$name creates an activity only when fresh or above, or admin', (role) =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      const me = w.ids[role.name]
      await as(tx, me)
      const created = () => tx`
        insert into public.activities (group_id, type, title, created_by)
        values (${w.group}, 'campaign', 'New campaign', ${me as string})`
      expect(await isDenied(tx, created)).toBe(!canCreateInGroup(actor(role)))
    }),
  )

  it('refuses another creator, a General activity, an archived start and an archived group', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      const archivedGroup = await addGroup(tx, { archived: true })
      const admin = w.ids.admin as string
      await as(tx, w.fresh)
      const insert =
        (fields: { by?: string; type?: string; general?: boolean; archived?: boolean }) => () => tx`
          insert into public.activities (group_id, type, title, created_by, is_general, archived_at)
          values (${w.group}, ${fields.type ?? 'campaign'}, 'Title', ${fields.by ?? w.fresh},
            ${fields.general ?? false}, ${fields.archived ? new Date() : null})`
      expect(await isDenied(tx, insert({ by: w.otherFresh }))).toBe(true)
      expect(await isDenied(tx, insert({ type: 'general' }))).toBe(true)
      expect(await isDenied(tx, insert({ general: true }))).toBe(true)
      expect(await isDenied(tx, insert({ archived: true }))).toBe(true)
      expect(await isDenied(tx, insert({}))).toBe(false)
      await as(tx, admin)
      const inArchived = () => tx`
        insert into public.activities (group_id, type, title, created_by)
        values (${archivedGroup}, 'campaign', 'Title', ${admin})`
      expect(await isDenied(tx, inArchived)).toBe(true)
    }))
})

describe('editing and archiving activities', () => {
  it.each(ROLES)('$name edits an activity the fresh member created only when allowed', (role) =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      await as(tx, w.ids[role.name])
      const changed = await rowsChanged(
        tx,
        () => tx`update public.activities set title = 'Renamed' where id = ${w.activity}`,
      )
      expect(changed).toBe(canEditActivity(editsAsCreator(role)) ? 1 : 0)
    }),
  )

  it("lets a fresh member edit their own activity but not someone else's", () =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      await as(tx, w.fresh)
      const own = await rowsChanged(
        tx,
        () => tx`update public.activities set key_activity = true where id = ${w.activity}`,
      )
      const others = await rowsChanged(
        tx,
        () => tx`update public.activities set key_activity = true where id = ${w.others}`,
      )
      expect([own, others]).toEqual([1, 0])
      await as(tx, w.ids['experienced member'])
      const byExperienced = await rowsChanged(
        tx,
        () => tx`update public.activities set title = 'Edited' where id = ${w.activity}`,
      )
      expect(byExperienced).toBe(1)
    }))

  it('lets the lead edit but not archive an activity they did not create', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      await addParticipant(tx, w.others, w.otherFresh)
      await tx`update public.activities set lead_id = ${w.otherFresh} where id = ${w.others}`
      await as(tx, w.otherFresh)
      const edited = await rowsChanged(
        tx,
        () => tx`update public.activities set description = 'Lead notes' where id = ${w.others}`,
      )
      expect(edited).toBe(1)
      const archived = () =>
        tx`update public.activities set archived_at = now() where id = ${w.others}`
      expect(await errorCodeOf(tx, archived)).toBe('42501')
    }))

  it.each(ROLES)('$name archives an activity the fresh member created only when allowed', (role) =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      await as(tx, w.ids[role.name])
      const changed = await rowsChanged(
        tx,
        () => tx`update public.activities set archived_at = now() where id = ${w.activity}`,
      )
      expect(changed).toBe(canArchiveActivity(editsAsCreator(role)) ? 1 : 0)
    }),
  )

  it('lets an experienced member restore an archived activity and a fresh member not', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      await as(tx, w.otherFresh)
      const byFresh = await rowsChanged(
        tx,
        () => tx`update public.activities set archived_at = null where id = ${w.archived}`,
      )
      expect(byFresh).toBe(0)
      await as(tx, w.ids['experienced member'])
      const byExperienced = await rowsChanged(
        tx,
        () => tx`update public.activities set archived_at = null where id = ${w.archived}`,
      )
      expect(byExperienced).toBe(1)
    }))

  it('refuses rewriting the creator, even for an admin', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      for (const who of [w.ids['experienced member'], w.ids.admin]) {
        await as(tx, who)
        const rewritten = () =>
          tx`update public.activities set created_by = ${who as string} where id = ${w.activity}`
        expect(await errorCodeOf(tx, rewritten)).toBe('42501')
      }
    }))

  it.each(ROLES)('$name deletes no activity and no task', (role) =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      await as(tx, w.ids[role.name])
      expect(
        await isDenied(tx, () => tx`delete from public.activities where id = ${w.activity}`),
      ).toBe(true)
      expect(await isDenied(tx, () => tx`delete from public.tasks where id = ${w.open}`)).toBe(true)
    }),
  )
})

describe('participants', () => {
  it.each(ROLES)('$name joins as observer only as an active member or admin', (role) =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      await as(tx, w.ids[role.name])
      const a = actor(role)
      const code = await errorCodeOf(
        tx,
        () => tx`select public.join_activity(${w.activity}, 'observer')`,
      )
      // Outsiders and deactivated people learn nothing: "not found".
      expect(code).toBe(a.isAdmin || a.isMember ? null : 'P0002')
    }),
  )

  it.each(ROLES)('$name joins as participant only when fresh or above, or admin', (role) =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      await as(tx, w.ids[role.name])
      const a = actor(role)
      const code = await errorCodeOf(
        tx,
        () => tx`select public.join_activity(${w.activity}, 'participant')`,
      )
      const expected = !(a.isAdmin || a.isMember)
        ? 'P0002'
        : participantRoleFor(role.level, a.isAdmin).includes('participant')
          ? null
          : '42501'
      expect(code).toBe(expected)
    }),
  )

  it('changes the role of someone who joins again, and lets a new volunteer observe General', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      await as(tx, w.otherFresh)
      await tx`select public.join_activity(${w.activity}, 'participant')`
      await tx`select public.join_activity(${w.activity}, 'observer')`
      const rows = await tx`
        select role from public.activity_participants
        where activity_id = ${w.activity} and user_id = ${w.otherFresh}`
      expect(rows.map((row) => row.role)).toEqual(['observer'])
      await as(tx, w.ids['new member'])
      expect(
        await errorCodeOf(tx, () => tx`select public.join_activity(${w.general}, 'observer')`),
      ).toBeNull()
      expect(
        await errorCodeOf(tx, () => tx`select public.join_activity(${w.general}, 'participant')`),
      ).toBe('42501')
    }))

  it('refuses joining an archived activity', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      await as(tx, w.ids['experienced member'])
      expect(
        await errorCodeOf(tx, () => tx`select public.join_activity(${w.archived}, 'participant')`),
      ).toBe('55000')
    }))

  it('lets a participant leave, clears their lead role, and reports when there was nothing to leave', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      await tx`update public.activities set lead_id = ${w.fresh} where id = ${w.activity}`
      await as(tx, w.fresh)
      const [first] = await tx`select public.leave_activity(${w.activity}) as left`
      const [second] = await tx`select public.leave_activity(${w.activity}) as left`
      expect([first?.left, second?.left]).toEqual([true, false])
      await actAs(tx, 'superuser')
      const [row] = await tx`select lead_id from public.activities where id = ${w.activity}`
      expect(row?.lead_id).toBeNull()
    }))

  it('refuses leave_activity to a deactivated person', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      await as(tx, w.ids['deactivated member'])
      expect(await errorCodeOf(tx, () => tx`select public.leave_activity(${w.activity})`)).toBe(
        '42501',
      )
    }))

  it('lets nobody write participant rows directly, not even an admin', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      for (const who of [w.fresh, w.ids.admin as string]) {
        await as(tx, who)
        const added = () => tx`
          insert into public.activity_participants (activity_id, user_id)
          values (${w.others}, ${who})`
        const changed = () => tx`
          update public.activity_participants set role = 'observer'
          where activity_id = ${w.activity}`
        const removed = () =>
          tx`delete from public.activity_participants where activity_id = ${w.activity}`
        expect(await isDenied(tx, added)).toBe(true)
        expect(await isDenied(tx, changed)).toBe(true)
        expect(await isDenied(tx, removed)).toBe(true)
      }
    }))
})

describe('set_activity_lead', () => {
  it.each(ROLES)('$name sets the lead only when they may edit the activity', (role) =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      await as(tx, w.ids[role.name])
      const a = actor(role)
      const code = await errorCodeOf(
        tx,
        () => tx`select public.set_activity_lead(${w.activity}, ${w.fresh})`,
      )
      const expected = canEditActivity(editsAsCreator(role)) ? null : a.isMember ? '42501' : 'P0002'
      expect(code).toBe(expected)
    }),
  )

  it('refuses an observer or a non-participant as lead, and clears with null', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      await addParticipant(tx, w.activity, w.ids['new member'] as string, 'observer')
      await as(tx, w.fresh)
      const lead = (user: string | null) => () =>
        tx`select public.set_activity_lead(${w.activity}, ${user})`
      expect(await errorCodeOf(tx, lead(w.ids['new member'] as string))).toBe('22023')
      expect(await errorCodeOf(tx, lead(w.otherFresh))).toBe('22023')
      expect(await errorCodeOf(tx, lead(w.fresh))).toBeNull()
      expect(await errorCodeOf(tx, lead(null))).toBeNull()
      const [row] = await tx`select lead_id from public.activities where id = ${w.activity}`
      expect(row?.lead_id).toBeNull()
    }))

  it('refuses a lead for an archived activity', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      await addParticipant(tx, w.archived, w.ids['experienced member'] as string)
      await as(tx, w.ids['experienced member'])
      expect(
        await errorCodeOf(
          tx,
          () =>
            tx`select public.set_activity_lead(${w.archived}, ${w.ids['experienced member'] as string})`,
        ),
      ).toBe('55000')
    }))
})
