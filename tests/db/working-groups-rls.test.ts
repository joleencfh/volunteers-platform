// W-01: working group tables, policy helpers, triggers and the Lobbying seed.
// Pattern: tests/db/onboarding-rls.test.ts. Spec sections 3 and 5, ADR-0018.
import { afterAll, describe, expect, it } from 'vitest'
import { canApproveJoin, canAssignLead, canEditGroupContent } from '@/lib/domain/groups'
import { actAs, inRolledBackTransaction, isDenied, sql } from './helpers/db'
import {
  actor,
  addGroup,
  addToGroup,
  as,
  MEETING_URL,
  MEMBER_ROWS,
  ROLES,
  rowsChanged,
  weekStart,
  world,
} from './helpers/groups'
import { addMember } from './helpers/members'

afterAll(async () => {
  await sql.end({ timeout: 2 })
})

describe('Lobbying seed', () => {
  it('exists, is active and has no members', () =>
    inRolledBackTransaction(async (tx) => {
      const [group] = await tx`
        select id, name, archived_at from public.working_groups where slug = 'lobbying'`
      expect(group).toMatchObject({ name: 'Lobbying', archived_at: null })
      const members = await tx`select 1 from public.wg_members where group_id = ${group?.id}`
      expect(members.length).toBe(0)
    }))
})

describe('policy helpers', () => {
  const combos = (['new', 'fresh', 'experienced'] as const).flatMap((level) =>
    [false, true].flatMap((isAdmin) =>
      [false, true].map((isMember) => ({ level, isAdmin, isMember })),
    ),
  )

  it.each(combos)(
    'agree with lib/domain/groups.ts for level $level, admin $isAdmin, member $isMember',
    (combo) =>
      inRolledBackTransaction(async (tx) => {
        const group = await addGroup(tx)
        const me = await addMember(tx, { level: combo.level, isAdmin: combo.isAdmin })
        if (combo.isMember) await addToGroup(tx, group, me)
        await as(tx, me)
        const [row] = await tx`
          select public.can_approve_join(${group}) as approve,
            public.can_assign_lead(${group}) as assign,
            public.can_edit_group_content(${group}) as edit,
            public.can_request_join(${group}) as request,
            public.is_wg_member(${group}) as member`
        expect(row).toEqual({
          approve: canApproveJoin(combo),
          assign: canAssignLead(combo),
          edit: canEditGroupContent(combo),
          request: !combo.isAdmin && !combo.isMember,
          member: combo.isMember,
        })
      }),
  )

  it('give a deactivated member and a deactivated admin no rights', () =>
    inRolledBackTransaction(async (tx) => {
      const group = await addGroup(tx)
      const member = await addMember(tx, { level: 'experienced', status: 'deactivated' })
      const admin = await addMember(tx, { isAdmin: true, status: 'deactivated' })
      await addToGroup(tx, group, member)
      for (const id of [member, admin]) {
        await as(tx, id)
        const [row] = await tx`
          select public.can_approve_join(${group}) as approve,
            public.can_assign_lead(${group}) as assign,
            public.can_edit_group_content(${group}) as edit,
            public.can_request_join(${group}) as request,
            public.is_wg_member(${group}) as member`
        expect(row).toEqual({
          approve: false,
          assign: false,
          edit: false,
          request: false,
          member: false,
        })
      }
    }))

  it('answer is_wg_member about someone else only to admins and members of the group', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await world(tx)
      const target = w.ids['new member']
      const ask = async (who: string) => {
        await as(tx, w.ids[who])
        const [row] = await tx`select public.is_wg_member(${w.group}, ${target}) as member`
        return row?.member
      }
      expect(await ask('fresh member')).toBe(true)
      expect(await ask('admin')).toBe(true)
      expect(await ask('fresh non-member')).toBe(false)
    }))

  it('deny anon every helper', () =>
    inRolledBackTransaction(async (tx) => {
      const group = await addGroup(tx)
      await actAs(tx, { role: 'anon' })
      for (const fn of [
        'is_active_working_group',
        'is_wg_member',
        'wg_member_level',
        'can_approve_join',
        'can_assign_lead',
        'can_edit_group_content',
        'can_request_join',
      ]) {
        expect(await isDenied(tx, () => tx.unsafe(`select public.${fn}($1)`, [group]))).toBe(true)
      }
    }))
})

describe('reading', () => {
  it.each(ROLES)(
    '$name reads the group, members, leads and meetings only as a member or admin',
    (role) =>
      inRolledBackTransaction(async (tx) => {
        const w = await world(tx)
        await as(tx, w.ids[role.name])
        const sees = actor(role).isAdmin || actor(role).isMember
        const groups = await tx`select id from public.working_groups where id = ${w.group}`
        const members = await tx`select user_id from public.wg_members where group_id = ${w.group}`
        const leads = await tx`select id from public.wg_leads where group_id = ${w.group}`
        const meetings = await tx`select id from public.wg_meetings where group_id = ${w.group}`
        expect(groups.length).toBe(sees ? 1 : 0)
        expect(members.length).toBe(sees ? MEMBER_ROWS : 0)
        expect(leads.length).toBe(sees ? 2 : 0)
        expect(meetings.length).toBe(sees ? 1 : 0)
      }),
  )

  it.each(ROLES)("$name sees other people's join requests only as an approver", (role) =>
    inRolledBackTransaction(async (tx) => {
      const w = await world(tx)
      await as(tx, w.ids[role.name])
      const rows = await tx`select id from public.wg_join_requests where group_id = ${w.group}`
      expect(rows.length).toBe(canApproveJoin(actor(role)) ? 2 : 0)
    }),
  )

  it('lets a requester see their own request and nobody else’s', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await world(tx)
      await as(tx, w.requester)
      const rows = await tx`select id, user_id from public.wg_join_requests`
      expect(rows.map((row) => row.id)).toEqual([w.request])
    }))

  it('denies anon every table', () =>
    inRolledBackTransaction(async (tx) => {
      await world(tx)
      await actAs(tx, { role: 'anon' })
      for (const table of [
        'working_groups',
        'wg_members',
        'wg_join_requests',
        'wg_leads',
        'wg_meetings',
      ]) {
        expect(await isDenied(tx, () => tx.unsafe(`select * from public.${table}`))).toBe(true)
      }
    }))
})

describe('working_groups writes', () => {
  it.each(ROLES)('$name creates and deletes groups only as an admin', (role) =>
    inRolledBackTransaction(async (tx) => {
      const w = await world(tx)
      await as(tx, w.ids[role.name])
      const created = () => tx`
        insert into public.working_groups (slug, name, description)
        values ('outreach-test', 'Outreach', 'Synthetic.')`
      expect(await isDenied(tx, created)).toBe(!actor(role).isAdmin)
      const deleted = await rowsChanged(
        tx,
        () => tx`delete from public.working_groups where id = ${w.group}`,
      )
      expect(deleted).toBe(actor(role).isAdmin ? 1 : 0)
    }),
  )

  it.each(ROLES)(
    '$name changes the Signal and docs links only when they may edit content',
    (role) =>
      inRolledBackTransaction(async (tx) => {
        const w = await world(tx)
        await as(tx, w.ids[role.name])
        const changed = await rowsChanged(
          tx,
          () => tx`
          update public.working_groups
          set signal_url = 'https://signal.example.test/g', docs_url = null
          where id = ${w.group}`,
        )
        expect(changed).toBe(canEditGroupContent(actor(role)) ? 1 : 0)
      }),
  )

  it.each(ROLES)('$name renames or archives the group only as an admin', (role) =>
    inRolledBackTransaction(async (tx) => {
      const w = await world(tx)
      await as(tx, w.ids[role.name])
      const renamed = await rowsChanged(
        tx,
        () => tx`update public.working_groups set name = 'Renamed' where id = ${w.group}`,
      )
      const archived = await rowsChanged(
        tx,
        () => tx`update public.working_groups set archived_at = now() where id = ${w.group}`,
      )
      expect([renamed, archived]).toEqual(actor(role).isAdmin ? [1, 1] : [0, 0])
    }),
  )

  it('refuses a fresh member who changes a link and the description together', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await world(tx)
      await as(tx, w.ids['fresh member'])
      const both = () => tx`
        update public.working_groups
        set docs_url = 'https://docs.example.test/g', description = 'Changed.'
        where id = ${w.group}`
      expect(await isDenied(tx, both)).toBe(true)
    }))

  it('refuses links that are not https and slugs that are not lowercase words', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await world(tx)
      await as(tx, w.ids.admin)
      const http = () => tx`
        update public.working_groups set signal_url = 'http://x.test' where id = ${w.group}`
      const slug = () => tx`
        insert into public.working_groups (slug, name, description)
        values ('Not A Slug', 'Name', 'Description.')`
      expect(await isDenied(tx, http)).toBe(true)
      expect(await isDenied(tx, slug)).toBe(true)
    }))
})

describe('wg_members writes', () => {
  it.each(ROLES)('$name adds and removes members only as an admin', (role) =>
    inRolledBackTransaction(async (tx) => {
      const w = await world(tx)
      await as(tx, w.ids[role.name])
      const added = () => tx`
        insert into public.wg_members (group_id, user_id) values (${w.group}, ${w.requester})`
      expect(await isDenied(tx, added)).toBe(!actor(role).isAdmin)
      const removed = await rowsChanged(
        tx,
        () => tx`
          delete from public.wg_members
          where group_id = ${w.group} and user_id = ${w.ids['fresh member']}`,
      )
      expect(removed).toBe(actor(role).isAdmin ? 1 : 0)
    }),
  )

  it('lets nobody edit a membership row, not even an admin', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await world(tx)
      await as(tx, w.ids.admin)
      const edited = () =>
        tx`update public.wg_members set joined_at = now() where group_id = ${w.group}`
      expect(await isDenied(tx, edited)).toBe(true)
    }))

  it('removing a member deletes their current and future lead weeks in that group only', () =>
    inRolledBackTransaction(async (tx) => {
      const group = await addGroup(tx)
      const other = await addGroup(tx)
      const admin = await addMember(tx, { isAdmin: true })
      const lead = await addMember(tx)
      await addToGroup(tx, group, lead)
      await addToGroup(tx, other, lead)
      await tx`
        insert into public.wg_leads (group_id, week_start, user_id) values
          (${group}, ${weekStart(-1)}, ${lead}), (${group}, ${weekStart()}, ${lead}),
          (${group}, ${weekStart(2)}, ${lead}), (${other}, ${weekStart()}, ${lead})`
      await as(tx, admin)
      await tx`delete from public.wg_members where group_id = ${group} and user_id = ${lead}`
      await actAs(tx, 'superuser')
      const left = await tx`
        select group_id, week_start::text as week from public.wg_leads where user_id = ${lead}
        order by week_start`
      expect(left.map((row) => [row.group_id, row.week])).toEqual([
        [group, weekStart(-1)],
        [other, weekStart()],
      ])
    }))
})

describe('wg_join_requests writes', () => {
  it.each(ROLES)('$name asks to join only as an active non-member who is not an admin', (role) =>
    inRolledBackTransaction(async (tx) => {
      const w = await world(tx)
      const me = w.ids[role.name]
      await as(tx, me)
      const asked = () => tx`
        insert into public.wg_join_requests (group_id, user_id) values (${w.group}, ${me})`
      const a = actor(role)
      const allowed = role.status !== 'deactivated' && !a.isAdmin && !a.isMember
      expect(await isDenied(tx, asked)).toBe(!allowed)
    }),
  )

  it('refuses a request for someone else or one that arrives already decided', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await world(tx)
      const me = w.ids['fresh non-member'] as string
      await as(tx, me)
      const forOther = () => tx`
        insert into public.wg_join_requests (group_id, user_id)
        values (${w.group}, ${w.ids['new non-member']})`
      const decided = () => tx`
        insert into public.wg_join_requests (group_id, user_id, status, decided_at, decided_by)
        values (${w.group}, ${me}, 'approved', now(), ${me})`
      expect(await isDenied(tx, forOther)).toBe(true)
      expect(await isDenied(tx, decided)).toBe(true)
    }))

  it('blocks a second pending request but lets a rejected person ask again', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await world(tx)
      await as(tx, w.requester)
      const again = () => tx`
        insert into public.wg_join_requests (group_id, user_id) values (${w.group}, ${w.requester})`
      expect(await isDenied(tx, again)).toBe(true)
      await as(tx, w.rejected)
      const retry = () => tx`
        insert into public.wg_join_requests (group_id, user_id) values (${w.group}, ${w.rejected})`
      expect(await isDenied(tx, retry)).toBe(false)
    }))

  it('lets nobody change or delete a request directly, not even an approver', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await world(tx)
      for (const who of ['fresh member', 'admin']) {
        await as(tx, w.ids[who])
        const approved = () => tx`
          update public.wg_join_requests set status = 'approved', decided_at = now()
          where id = ${w.request}`
        const deleted = () => tx`delete from public.wg_join_requests where id = ${w.request}`
        expect(await isDenied(tx, approved)).toBe(true)
        expect(await isDenied(tx, deleted)).toBe(true)
      }
    }))
})

describe('wg_leads writes', () => {
  it.each(ROLES)("$name assigns next week's lead only when they may assign leads", (role) =>
    inRolledBackTransaction(async (tx) => {
      const w = await world(tx)
      const me = w.ids[role.name]
      await as(tx, me)
      const assigned = () => tx`
        insert into public.wg_leads (group_id, week_start, user_id, assigned_by)
        values (${w.group}, ${weekStart(1)}, ${w.ids['fresh member']}, ${me})`
      expect(await isDenied(tx, assigned)).toBe(!canAssignLead(actor(role)))
    }),
  )

  it('replaces the row when an assigner reassigns a week', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await world(tx)
      const me = w.ids['experienced member'] as string
      await as(tx, me)
      await tx`
        insert into public.wg_leads (group_id, week_start, user_id, assigned_by)
        values (${w.group}, ${weekStart()}, ${w.ids['fresh member']}, ${me})
        on conflict (group_id, week_start)
        do update set user_id = excluded.user_id, assigned_by = excluded.assigned_by`
      const rows = await tx`
        select user_id, assigned_by from public.wg_leads
        where group_id = ${w.group} and week_start = ${weekStart()}`
      expect(rows).toEqual([{ user_id: w.ids['fresh member'], assigned_by: me }])
    }))

  it('refuses a past week, a day that is not a Monday, a non-member lead or another assigner', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await world(tx)
      const me = w.ids['experienced member'] as string
      const lead = w.ids['fresh member'] as string
      const tuesday = new Date(`${weekStart(1)}T00:00:00Z`)
      tuesday.setUTCDate(tuesday.getUTCDate() + 1)
      await as(tx, me)
      const insert = (week: string, user: string, by: string) => () => tx`
        insert into public.wg_leads (group_id, week_start, user_id, assigned_by)
        values (${w.group}, ${week}, ${user}, ${by})`
      expect(await isDenied(tx, insert(weekStart(-2), lead, me))).toBe(true)
      expect(await isDenied(tx, insert(tuesday.toISOString().slice(0, 10), lead, me))).toBe(true)
      expect(
        await isDenied(tx, insert(weekStart(1), w.ids['fresh non-member'] as string, me)),
      ).toBe(true)
      expect(await isDenied(tx, insert(weekStart(1), lead, w.ids.admin as string))).toBe(true)
      expect(await isDenied(tx, insert(weekStart(1), lead, me))).toBe(false)
    }))

  it('keeps past weeks read-only, even for an admin', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await world(tx)
      const admin = w.ids.admin as string
      await as(tx, admin)
      const changed = await rowsChanged(
        tx,
        () => tx`
          update public.wg_leads set user_id = ${w.ids['fresh member']}, assigned_by = ${admin}
          where group_id = ${w.group} and week_start = ${weekStart(-1)}`,
      )
      expect(changed).toBe(0)
      const deleted = () => tx`delete from public.wg_leads where group_id = ${w.group}`
      expect(await isDenied(tx, deleted)).toBe(true)
    }))
})

describe('wg_meetings writes', () => {
  it.each(ROLES)(
    '$name adds, changes and deletes meetings only when they may edit content',
    (role) =>
      inRolledBackTransaction(async (tx) => {
        const w = await world(tx)
        const me = w.ids[role.name]
        await as(tx, me)
        const allowed = canEditGroupContent(actor(role))
        const added = () => tx`
        insert into public.wg_meetings (group_id, starts_at, meeting_url, created_by)
        values (${w.group}, now() + interval '2 days', ${MEETING_URL}, ${me})`
        expect(await isDenied(tx, added)).toBe(!allowed)
        const changed = await rowsChanged(
          tx,
          () => tx`
          update public.wg_meetings set agenda_url = 'https://docs.example.test/agenda'
          where id = ${w.meeting}`,
        )
        const deleted = await rowsChanged(
          tx,
          () => tx`delete from public.wg_meetings where id = ${w.meeting}`,
        )
        expect([changed, deleted]).toEqual(allowed ? [1, 1] : [0, 0])
      }),
  )

  it('refuses a meeting link that is not https', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await world(tx)
      const me = w.ids['fresh member'] as string
      await as(tx, me)
      const added = () => tx`
        insert into public.wg_meetings (group_id, starts_at, meeting_url, created_by)
        values (${w.group}, now(), 'http://meet.example.test', ${me})`
      expect(await isDenied(tx, added)).toBe(true)
    }))
})

describe('archived groups', () => {
  it('are hidden with every child row from their members and requesters, not from admins', () =>
    inRolledBackTransaction(async (tx) => {
      const group = await addGroup(tx, { archived: true })
      const member = await addMember(tx, { level: 'experienced' })
      const requester = await addMember(tx)
      const outsider = await addMember(tx)
      const admin = await addMember(tx, { isAdmin: true })
      await addToGroup(tx, group, member)
      await tx`insert into public.wg_join_requests (group_id, user_id) values (${group}, ${requester})`
      await tx`
        insert into public.wg_leads (group_id, week_start, user_id)
        values (${group}, ${weekStart()}, ${member})`
      await tx`
        insert into public.wg_meetings (group_id, starts_at, meeting_url)
        values (${group}, now(), ${MEETING_URL})`

      const counts = async () => [
        (await tx`select 1 from public.working_groups where id = ${group}`).length,
        (await tx`select 1 from public.wg_members where group_id = ${group}`).length,
        (await tx`select 1 from public.wg_join_requests where group_id = ${group}`).length,
        (await tx`select 1 from public.wg_leads where group_id = ${group}`).length,
        (await tx`select 1 from public.wg_meetings where group_id = ${group}`).length,
      ]
      await as(tx, member)
      expect(await counts()).toEqual([0, 0, 0, 0, 0])
      const added = () => tx`
        insert into public.wg_meetings (group_id, starts_at, meeting_url, created_by)
        values (${group}, now(), ${MEETING_URL}, ${member})`
      expect(await isDenied(tx, added)).toBe(true)
      await as(tx, requester)
      expect(await counts()).toEqual([0, 0, 0, 0, 0])
      await as(tx, outsider)
      const asked = () => tx`
        insert into public.wg_join_requests (group_id, user_id) values (${group}, ${outsider})`
      expect(await isDenied(tx, asked)).toBe(true)
      await as(tx, admin)
      expect(await counts()).toEqual([1, 1, 1, 1, 1])
      const restored =
        await tx`update public.working_groups set archived_at = null where id = ${group}`
      expect(restored.count).toBe(1)
    }))
})
