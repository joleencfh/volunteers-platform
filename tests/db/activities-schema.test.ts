// T-01 (part 1): constraints and triggers of activities, activity_participants and tasks, run as
// the superuser. The role matrix (policies and helpers) is in tests/db/activities-rls.test.ts
// (part 2). Spec sections 2 and 5, ADR-0019.
import { afterAll, describe, expect, it } from 'vitest'
import { inRolledBackTransaction, sql, type Tx } from './helpers/db'
import { addGroup, addToGroup } from './helpers/groups'
import { addMember } from './helpers/members'
import {
  addActivity,
  addParticipant,
  addTask,
  errorOf,
  generalActivityOf,
} from './helpers/activities'

afterAll(async () => {
  await sql.end({ timeout: 2 })
})

/** A group, one of its activities and a task in it. */
async function setup(tx: Tx) {
  const group = await addGroup(tx)
  const activity = await addActivity(tx, group)
  const task = await addTask(tx, activity)
  return { group, activity, task }
}

describe('task done constraint', () => {
  it('accepts a note only', () =>
    inRolledBackTransaction(async (tx) => {
      const { task } = await setup(tx)
      const error = await errorOf(
        tx,
        () =>
          tx`update public.tasks set status = 'done', completion_note = 'Replied' where id = ${task}`,
      )
      expect(error).toBeNull()
    }))

  it('accepts a link only', () =>
    inRolledBackTransaction(async (tx) => {
      const { task } = await setup(tx)
      const error = await errorOf(
        tx,
        () => tx`
          update public.tasks set status = 'done', completion_url = 'https://example.test/result'
          where id = ${task}`,
      )
      expect(error).toBeNull()
    }))

  it('accepts both a note and a link', () =>
    inRolledBackTransaction(async (tx) => {
      const { task } = await setup(tx)
      const error = await errorOf(
        tx,
        () => tx`
          update public.tasks
          set status = 'done', completion_note = 'Posted', completion_url = 'https://example.test/post'
          where id = ${task}`,
      )
      expect(error).toBeNull()
    }))

  it('refuses neither a note nor a link, or a blank note', () =>
    inRolledBackTransaction(async (tx) => {
      const { task } = await setup(tx)
      expect(
        await errorOf(tx, () => tx`update public.tasks set status = 'done' where id = ${task}`),
      ).toMatch(/tasks_done_needs_note_or_link/)
      expect(
        await errorOf(
          tx,
          () =>
            tx`update public.tasks set status = 'done', completion_note = '   ' where id = ${task}`,
        ),
      ).toMatch(/tasks_done_needs_note_or_link/)
    }))

  it('refuses a completion link that is not https', () =>
    inRolledBackTransaction(async (tx) => {
      const { task } = await setup(tx)
      expect(
        await errorOf(
          tx,
          () =>
            tx`update public.tasks set completion_url = 'http://example.test' where id = ${task}`,
        ),
      ).toMatch(/tasks_completion_url_check/)
    }))
})

describe('task completed_at', () => {
  it('is set when the task becomes done, kept while done and cleared when reopened', () =>
    inRolledBackTransaction(async (tx) => {
      const { task } = await setup(tx)
      const [open] = await tx`select completed_at from public.tasks where id = ${task}`
      expect(open?.completed_at).toBeNull()

      const [done] = await tx`
        update public.tasks set status = 'done', completion_note = 'Done'
        where id = ${task} returning completed_at`
      expect(done?.completed_at).toBeInstanceOf(Date)

      const [kept] = await tx`
        update public.tasks set completed_at = '2000-01-01', title = 'Renamed'
        where id = ${task} returning completed_at`
      expect(kept?.completed_at).toEqual(done?.completed_at)

      const [reopened] = await tx`
        update public.tasks set status = 'open' where id = ${task} returning completed_at`
      expect(reopened?.completed_at).toBeNull()
    }))

  it('is set for a task inserted as done and ignores a supplied value for an open one', () =>
    inRolledBackTransaction(async (tx) => {
      const { group, activity } = await setup(tx)
      const [done] = await tx`
        insert into public.tasks (activity_id, group_id, title, status, completion_note, completed_at)
        values (${activity}, ${group}, 'Inserted done', 'done', 'Done', '2000-01-01')
        returning completed_at`
      expect((done?.completed_at as Date).getUTCFullYear()).toBeGreaterThan(2000)
      const [open] = await tx`
        insert into public.tasks (activity_id, group_id, title, completed_at)
        values (${activity}, ${group}, 'Inserted open', now())
        returning completed_at`
      expect(open?.completed_at).toBeNull()
    }))
})

describe('task group', () => {
  it("is always the activity's group", () =>
    inRolledBackTransaction(async (tx) => {
      const { group, activity } = await setup(tx)
      const other = await addGroup(tx)
      const [row] = await tx`
        insert into public.tasks (activity_id, group_id, title)
        values (${activity}, ${other}, 'Wrong group') returning id, group_id`
      expect(row?.group_id).toBe(group)

      const otherActivity = await addActivity(tx, other)
      const [moved] = await tx`
        update public.tasks set activity_id = ${otherActivity} where id = ${row?.id}
        returning group_id`
      expect(moved?.group_id).toBe(other)
    }))
})

describe('General activity', () => {
  it('is created for a new group, active and with the fixed title and type', () =>
    inRolledBackTransaction(async (tx) => {
      const group = await addGroup(tx)
      const rows = await tx`
        select type, title, status, is_general, archived_at from public.activities
        where group_id = ${group}`
      expect(rows).toEqual([
        {
          type: 'general',
          title: 'General',
          status: 'active',
          is_general: true,
          archived_at: null,
        },
      ])
    }))

  it('was backfilled for Lobbying', () =>
    inRolledBackTransaction(async (tx) => {
      const rows = await tx`
        select a.title from public.activities a
        join public.working_groups g on g.id = a.group_id
        where g.slug = 'lobbying' and a.is_general`
      expect(rows.map((row) => row.title)).toEqual(['General'])
    }))

  it('is unique per group', () =>
    inRolledBackTransaction(async (tx) => {
      const group = await addGroup(tx)
      expect(
        await errorOf(
          tx,
          () => tx`
            insert into public.activities (group_id, type, title, is_general)
            values (${group}, 'general', 'Second General', true)`,
        ),
      ).toMatch(/activities_one_general_per_group/)
    }))

  it('cannot be deleted while its group exists', () =>
    inRolledBackTransaction(async (tx) => {
      const group = await addGroup(tx)
      const general = await generalActivityOf(tx, group)
      expect(
        await errorOf(tx, () => tx`delete from public.activities where id = ${general}`),
      ).toMatch(/cannot be deleted/)
    }))

  it('goes with its group when the group is deleted', () =>
    inRolledBackTransaction(async (tx) => {
      const { group, activity } = await setup(tx)
      const general = await generalActivityOf(tx, group)
      await addTask(tx, general)
      await tx`delete from public.working_groups where id = ${group}`
      const left = await tx`
        select id from public.activities where id in (${general}, ${activity})`
      expect(left.length).toBe(0)
      const tasks = await tx`select id from public.tasks where group_id = ${group}`
      expect(tasks.length).toBe(0)
    }))

  it('cannot be renamed, retyped, cancelled or archived', () =>
    inRolledBackTransaction(async (tx) => {
      const group = await addGroup(tx)
      const general = await generalActivityOf(tx, group)
      const changes = [
        () => tx`update public.activities set title = 'Renamed' where id = ${general}`,
        () => tx`update public.activities set type = 'campaign' where id = ${general}`,
        () => tx`update public.activities set status = 'cancelled' where id = ${general}`,
        () => tx`update public.activities set archived_at = now() where id = ${general}`,
      ]
      for (const change of changes) {
        expect(await errorOf(tx, change)).toMatch(/General activity cannot be/)
      }
    }))

  it('can still change its description and status otherwise', () =>
    inRolledBackTransaction(async (tx) => {
      const group = await addGroup(tx)
      const general = await generalActivityOf(tx, group)
      expect(
        await errorOf(
          tx,
          () => tx`
            update public.activities set description = 'Loose tasks', status = 'planned'
            where id = ${general}`,
        ),
      ).toBeNull()
    }))
})

describe('activity identity', () => {
  it('keeps its group', () =>
    inRolledBackTransaction(async (tx) => {
      const { activity } = await setup(tx)
      const other = await addGroup(tx)
      expect(
        await errorOf(
          tx,
          () => tx`update public.activities set group_id = ${other} where id = ${activity}`,
        ),
      ).toMatch(/keeps its group/)
    }))

  it('keeps its General flag', () =>
    inRolledBackTransaction(async (tx) => {
      const { group, activity } = await setup(tx)
      const general = await generalActivityOf(tx, group)
      expect(
        await errorOf(
          tx,
          () => tx`update public.activities set is_general = true where id = ${activity}`,
        ),
      ).toMatch(/keeps its group and General flag/)
      expect(
        await errorOf(
          tx,
          () => tx`update public.activities set is_general = false where id = ${general}`,
        ),
      ).toMatch(/keeps its group and General flag/)
    }))

  it('other activities can be deleted', () =>
    inRolledBackTransaction(async (tx) => {
      const { activity } = await setup(tx)
      expect(
        await errorOf(tx, () => tx`delete from public.activities where id = ${activity}`),
      ).toBeNull()
    }))
})

describe('activity lead', () => {
  async function withPerson(tx: Tx) {
    const { group, activity } = await setup(tx)
    const person = await addMember(tx, { level: 'fresh' })
    await addToGroup(tx, group, person)
    return { activity, person }
  }

  const setLead = (tx: Tx, activity: string, person: string | null) =>
    tx`update public.activities set lead_id = ${person} where id = ${activity}`

  it('must be a participant of the activity', () =>
    inRolledBackTransaction(async (tx) => {
      const { activity, person } = await withPerson(tx)
      expect(await errorOf(tx, () => setLead(tx, activity, person))).toMatch(
        /lead must be a participant/,
      )
      await addParticipant(tx, activity, person, 'participant')
      expect(await errorOf(tx, () => setLead(tx, activity, person))).toBeNull()
    }))

  it('cannot be an observer', () =>
    inRolledBackTransaction(async (tx) => {
      const { activity, person } = await withPerson(tx)
      await addParticipant(tx, activity, person, 'observer')
      expect(await errorOf(tx, () => setLead(tx, activity, person))).toMatch(
        /lead must be a participant/,
      )
    }))

  it('cannot be set when the activity is inserted, as it has no participants yet', () =>
    inRolledBackTransaction(async (tx) => {
      const { person } = await withPerson(tx)
      const group = await addGroup(tx)
      expect(
        await errorOf(
          tx,
          () => tx`
            insert into public.activities (group_id, type, title, lead_id)
            values (${group}, 'campaign', 'With a lead', ${person})`,
        ),
      ).toMatch(/lead must be a participant/)
    }))

  it('can be cleared', () =>
    inRolledBackTransaction(async (tx) => {
      const { activity, person } = await withPerson(tx)
      await addParticipant(tx, activity, person)
      await setLead(tx, activity, person)
      expect(await errorOf(tx, () => setLead(tx, activity, null))).toBeNull()
    }))

  it('is cleared when the lead becomes an observer', () =>
    inRolledBackTransaction(async (tx) => {
      const { activity, person } = await withPerson(tx)
      await addParticipant(tx, activity, person)
      await setLead(tx, activity, person)
      await tx`
        update public.activity_participants set role = 'observer'
        where activity_id = ${activity} and user_id = ${person}`
      const [row] = await tx`select lead_id from public.activities where id = ${activity}`
      expect(row?.lead_id).toBeNull()
    }))

  it('is cleared when the lead leaves, and kept when someone else leaves', () =>
    inRolledBackTransaction(async (tx) => {
      const { activity, person } = await withPerson(tx)
      const other = await addMember(tx, { level: 'fresh' })
      await addParticipant(tx, activity, person)
      await addParticipant(tx, activity, other)
      await setLead(tx, activity, person)
      await tx`
        delete from public.activity_participants
        where activity_id = ${activity} and user_id = ${other}`
      const [kept] = await tx`select lead_id from public.activities where id = ${activity}`
      expect(kept?.lead_id).toBe(person)
      await tx`
        delete from public.activity_participants
        where activity_id = ${activity} and user_id = ${person}`
      const [cleared] = await tx`select lead_id from public.activities where id = ${activity}`
      expect(cleared?.lead_id).toBeNull()
    }))
})

describe('activity columns', () => {
  it('require details to be a JSON object', () =>
    inRolledBackTransaction(async (tx) => {
      const { activity } = await setup(tx)
      expect(
        await errorOf(
          tx,
          () => tx`update public.activities set details = '[]'::jsonb where id = ${activity}`,
        ),
      ).toMatch(/activities_details_check/)
      expect(
        await errorOf(
          tx,
          () => tx`
            update public.activities set details = '{"send_date": "2026-12-01"}'::jsonb
            where id = ${activity}`,
        ),
      ).toBeNull()
    }))

  it('allow at most 20 links, as an array', () =>
    inRolledBackTransaction(async (tx) => {
      const { activity } = await setup(tx)
      const links = (count: number) =>
        JSON.stringify(Array.from({ length: count }, (_, i) => `https://example.test/${i}`))
      expect(
        await errorOf(
          tx,
          () => tx`update public.activities set links = ${links(20)}::jsonb where id = ${activity}`,
        ),
      ).toBeNull()
      expect(
        await errorOf(
          tx,
          () => tx`update public.activities set links = ${links(21)}::jsonb where id = ${activity}`,
        ),
      ).toMatch(/activities_links_check/)
      expect(
        await errorOf(
          tx,
          () => tx`update public.activities set links = '{}'::jsonb where id = ${activity}`,
        ),
      ).toMatch(/activities_links_check/)
    }))

  it('refuse a due date before the start date', () =>
    inRolledBackTransaction(async (tx) => {
      const { activity } = await setup(tx)
      expect(
        await errorOf(
          tx,
          () => tx`
            update public.activities set starts_on = '2026-12-02', due_on = '2026-12-01'
            where id = ${activity}`,
        ),
      ).toMatch(/check constraint/)
      expect(
        await errorOf(
          tx,
          () => tx`
            update public.activities set starts_on = '2026-12-01', due_on = '2026-12-01'
            where id = ${activity}`,
        ),
      ).toBeNull()
      expect(
        await errorOf(
          tx,
          () =>
            tx`update public.activities set starts_on = null, due_on = '2026-12-01' where id = ${activity}`,
        ),
      ).toBeNull()
    }))

  it('refuse a blank title', () =>
    inRolledBackTransaction(async (tx) => {
      const { activity } = await setup(tx)
      expect(
        await errorOf(
          tx,
          () => tx`update public.activities set title = '  ' where id = ${activity}`,
        ),
      ).toMatch(/activities_title_check/)
    }))
})

describe('row-level security', () => {
  it('is enabled on the three tables', () =>
    inRolledBackTransaction(async (tx) => {
      const tables = await tx`
        select c.relname, c.relrowsecurity from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname in ('activities', 'activity_participants', 'tasks')
        order by c.relname`
      expect(tables).toEqual([
        { relname: 'activities', relrowsecurity: true },
        { relname: 'activity_participants', relrowsecurity: true },
        { relname: 'tasks', relrowsecurity: true },
      ])
    }))
})
