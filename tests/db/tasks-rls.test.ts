// T-01 (part 2): the task policies and the guard_task_write rules, for every role (spec section 3
// matrix rows "Take a task, complete it, comment" and "Create tasks"; ADR-0019 "Access"). The
// activity and participant rules are in tests/db/activities-rls.test.ts.
import { afterAll, describe, expect, it } from 'vitest'
import { canCreateInGroup } from '@/lib/domain/activities'
import { inRolledBackTransaction, isDenied, sql } from './helpers/db'
import { activityWorld, errorCodeOf, isFresh } from './helpers/activities'
import { actor, as, ROLES, rowsChanged } from './helpers/groups'

afterAll(async () => {
  await sql.end({ timeout: 2 })
})

describe('creating tasks', () => {
  it.each(ROLES)('$name creates a task only when fresh or above, or admin', (role) =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      const me = w.ids[role.name]
      await as(tx, me)
      const created = () => tx`
        insert into public.tasks (activity_id, group_id, title, created_by)
        values (${w.activity}, ${w.group}, 'New task', ${me as string})`
      expect(await isDenied(tx, created)).toBe(!canCreateInGroup(actor(role)))
    }),
  )

  it('refuses another creator, a non-member assignee and a task created as done', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      await as(tx, w.fresh)
      const insert = (fields: { by?: string; assignee?: string; done?: boolean }) => () => tx`
        insert into public.tasks (activity_id, group_id, title, created_by, assignee_id, status,
          completion_note)
        values (${w.activity}, ${w.group}, 'Task', ${fields.by ?? w.fresh},
          ${fields.assignee ?? null}, ${fields.done ? 'done' : 'open'}, 'Note')`
      expect(await errorCodeOf(tx, insert({ by: w.otherFresh }))).toBe('42501')
      expect(await errorCodeOf(tx, insert({ assignee: w.ids['fresh non-member'] }))).toBe('23514')
      expect(await errorCodeOf(tx, insert({ assignee: w.ids['deactivated member'] }))).toBe('23514')
      expect(await errorCodeOf(tx, insert({ assignee: w.fresh, done: true }))).toBe('42501')
      expect(await errorCodeOf(tx, insert({ assignee: w.ids['new member'] }))).toBeNull()
    }))
})

describe('task updates', () => {
  it.each(ROLES)('$name takes an unassigned task only as a member of the group', (role) =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      const me = w.ids[role.name] as string
      await as(tx, me)
      const changed = await rowsChanged(
        tx,
        () => tx`update public.tasks set assignee_id = ${me} where id = ${w.open}`,
      )
      // An admin who is not in the group cannot be its assignee.
      expect(changed).toBe(actor(role).isMember ? 1 : 0)
    }),
  )

  it('lets a plain member take only an unassigned task, and change nothing else with it', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      await as(tx, w.otherFresh)
      const takeAssigned = () =>
        tx`update public.tasks set assignee_id = ${w.otherFresh} where id = ${w.assigned}`
      const takeAndRename = () => tx`
        update public.tasks set assignee_id = ${w.otherFresh}, title = 'Mine now' where id = ${w.open}`
      const rename = () => tx`update public.tasks set title = 'Renamed' where id = ${w.open}`
      const assignOther = () =>
        tx`update public.tasks set assignee_id = ${w.fresh} where id = ${w.open}`
      expect(await errorCodeOf(tx, takeAssigned)).toBe('42501')
      expect(await errorCodeOf(tx, takeAndRename)).toBe('42501')
      expect(await errorCodeOf(tx, rename)).toBe('42501')
      expect(await errorCodeOf(tx, assignOther)).toBe('42501')
    }))

  it.each(ROLES)('$name assigns and edits a task only as creator, experienced or admin', (role) =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      await as(tx, w.ids[role.name])
      const a = actor(role)
      // The open task was created by the fresh member and has no assignee.
      const allowed = a.isAdmin || (a.isMember && (isFresh(role) || role.level === 'experienced'))
      const assigned = await rowsChanged(
        tx,
        () => tx`update public.tasks set assignee_id = ${w.otherFresh} where id = ${w.open}`,
      )
      const edited = await rowsChanged(
        tx,
        () => tx`
          update public.tasks set title = 'Edited', description = 'More', due_on = current_date
          where id = ${w.open}`,
      )
      expect([assigned, edited]).toEqual(allowed ? [1, 1] : [0, 0])
    }),
  )

  it('lets the assignee edit, reassign and move the status to in progress', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      await as(tx, w.ids['new member'])
      const progress = await rowsChanged(
        tx,
        () => tx`update public.tasks set status = 'in_progress' where id = ${w.assigned}`,
      )
      const renamed = await rowsChanged(
        tx,
        () => tx`update public.tasks set title = 'Clearer title' where id = ${w.assigned}`,
      )
      const handedOn = await rowsChanged(
        tx,
        () => tx`update public.tasks set assignee_id = ${w.otherFresh} where id = ${w.assigned}`,
      )
      expect([progress, renamed, handedOn]).toEqual([1, 1, 1])
    }))

  it('refuses an assignee who is not an active member, even from an admin', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      for (const who of [w.ids['experienced member'], w.ids.admin]) {
        await as(tx, who)
        for (const outsider of [w.ids['fresh non-member'], w.ids['deactivated member']]) {
          const assigned = () =>
            tx`update public.tasks set assignee_id = ${outsider as string} where id = ${w.open}`
          expect(await errorCodeOf(tx, assigned)).toBe('23514')
        }
      }
    }))

  it.each(ROLES)('$name completes the assigned task only as its assignee or an admin', (role) =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      await as(tx, w.ids[role.name])
      const changed = await rowsChanged(
        tx,
        () => tx`
          update public.tasks set status = 'done', completion_note = 'Sent the letters'
          where id = ${w.assigned}`,
      )
      const allowed = actor(role).isAdmin || role.name === 'new member'
      expect(changed).toBe(allowed ? 1 : 0)
    }),
  )

  it('refuses completion details from someone who is not the assignee', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      await as(tx, w.ids['experienced member'])
      const noted = () => tx`
        update public.tasks set completion_url = 'https://example.test/result'
        where id = ${w.assigned}`
      expect(await errorCodeOf(tx, noted)).toBe('42501')
    }))

  it.each(ROLES)('$name reopens a done task only as an admin', (role) =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      await tx`
        update public.tasks set status = 'done', completion_note = 'Done' where id = ${w.assigned}`
      await as(tx, w.ids[role.name])
      const changed = await rowsChanged(
        tx,
        () => tx`update public.tasks set status = 'open' where id = ${w.assigned}`,
      )
      expect(changed).toBe(actor(role).isAdmin ? 1 : 0)
    }),
  )

  it('keeps a done task as it is for its assignee, and lets editors fix only the wording', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      await tx`
        update public.tasks set status = 'done', completion_note = 'Done' where id = ${w.assigned}`
      await as(tx, w.ids['new member'])
      const renoted = () =>
        tx`update public.tasks set completion_note = 'Changed' where id = ${w.assigned}`
      const handedOn = () =>
        tx`update public.tasks set assignee_id = ${w.otherFresh} where id = ${w.assigned}`
      expect(await errorCodeOf(tx, renoted)).toBe('42501')
      expect(await errorCodeOf(tx, handedOn)).toBe('42501')
      await as(tx, w.ids['experienced member'])
      const renamed = await rowsChanged(
        tx,
        () => tx`update public.tasks set title = 'Better title' where id = ${w.assigned}`,
      )
      expect(renamed).toBe(1)
    }))

  it('lets an admin reopen a task, which clears completed_at', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      await tx`
        update public.tasks set status = 'done', completion_note = 'Done' where id = ${w.assigned}`
      await as(tx, w.ids.admin)
      const [row] = await tx`
        update public.tasks set status = 'open' where id = ${w.assigned} returning completed_at`
      expect(row?.completed_at).toBeNull()
    }))

  it('refuses moving a task to another activity or rewriting its creator, except for admins', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      await as(tx, w.ids['experienced member'])
      const moved = () => tx`update public.tasks set activity_id = ${w.others} where id = ${w.open}`
      const creator = () =>
        tx`update public.tasks set created_by = ${w.otherFresh} where id = ${w.open}`
      expect(await errorCodeOf(tx, moved)).toBe('42501')
      expect(await errorCodeOf(tx, creator)).toBe('42501')
      await as(tx, w.ids.admin)
      expect(await errorCodeOf(tx, moved)).toBeNull()
    }))

  it('lets a new volunteer take and complete a task but never create one', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      const me = w.ids['new member'] as string
      await as(tx, me)
      const created = () => tx`
        insert into public.tasks (activity_id, group_id, title, created_by)
        values (${w.activity}, ${w.group}, 'Mine', ${me})`
      expect(await isDenied(tx, created)).toBe(true)
      const took = await rowsChanged(
        tx,
        () => tx`update public.tasks set assignee_id = ${me} where id = ${w.open}`,
      )
      const completed = await rowsChanged(
        tx,
        () => tx`
          update public.tasks set status = 'done', completion_url = 'https://example.test/post'
          where id = ${w.open}`,
      )
      expect([took, completed]).toEqual([1, 1])
    }))
})
