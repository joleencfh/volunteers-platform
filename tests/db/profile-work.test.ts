// T-06 (part 2): the profile feed of latest and planned work (spec section 7: only items in groups
// the viewer can fully see; get_profile_work in
// supabase/migrations/20261118091723_profile_work_feed.sql). Pattern: tests/db/profile-visibility.test.ts.
// Needs a local Supabase, so it runs in CI. Fixtures are created as the superuser before the first
// actAs().
import { afterAll, describe, expect, it } from 'vitest'
import { actAs, inRolledBackTransaction, isDenied, sql, type Tx } from './helpers/db'
import { addParticipant, generalActivityOf } from './helpers/activities'
import { addGroup, addToGroup } from './helpers/groups'
import { addAuthUser, addMember } from './helpers/members'

afterAll(async () => {
  await sql.end({ timeout: 2 })
})

type FeedRow = { kind: string; id: string; title: string; status: string; group_id: string }

async function feedAs(tx: Tx, viewer: string, owner: string): Promise<FeedRow[]> {
  await actAs(tx, { role: 'authenticated', userId: viewer })
  const rows = await tx<FeedRow[]>`select * from public.get_profile_work(${owner})`
  await actAs(tx, 'superuser')
  return rows
}

const titles = (rows: FeedRow[]) => rows.map((row) => row.title).sort()

async function activity(
  tx: Tx,
  group: string,
  title: string,
  options: { status?: string; updatedAt?: Date; leadId?: string } = {},
): Promise<string> {
  const [row] = await tx`
    insert into public.activities (group_id, type, title, status, updated_at)
    values (${group}, 'campaign', ${title}, ${options.status ?? 'active'},
      ${options.updatedAt ?? new Date()})
    returning id`
  return row?.id
}

async function task(
  tx: Tx,
  activityId: string,
  title: string,
  options: { assigneeId?: string; status?: string } = {},
): Promise<string> {
  const done = options.status === 'done'
  const [row] = await tx`
    insert into public.tasks (activity_id, group_id, title, assignee_id, status, completion_note)
    select ${activityId}, a.group_id, ${title}, ${options.assigneeId ?? null},
      ${options.status ?? 'open'}, ${done ? 'Synthetic note' : null}
    from public.activities a where a.id = ${activityId}
    returning id`
  return row?.id
}

/** Moves a done task's completion date back, past what the triggers would allow. */
async function completedDaysAgo(tx: Tx, taskId: string, days: number): Promise<void> {
  await tx`alter table public.tasks disable trigger set_task_completed_at`
  await tx`alter table public.tasks disable trigger set_updated_at`
  await tx`
    update public.tasks
    set completed_at = now() - make_interval(days => ${days}),
        updated_at = now() - make_interval(days => ${days})
    where id = ${taskId}`
  await tx`alter table public.tasks enable trigger set_updated_at`
  await tx`alter table public.tasks enable trigger set_task_completed_at`
}

/**
 * The owner belongs to `shared` (with `sharedViewer`) and `ownerOnly`; `otherGroup` has only
 * `otherViewer`; `archivedGroup` has the owner and `sharedViewer` but is archived. Each group the
 * owner is in has one activity the owner takes part in and one task assigned to the owner.
 */
async function feedWorld(tx: Tx) {
  const owner = await addMember(tx, { level: 'fresh' })
  const sharedViewer = await addMember(tx, { level: 'new' })
  const otherViewer = await addMember(tx, { level: 'experienced' })
  const loneViewer = await addMember(tx, { level: 'experienced' })
  const admin = await addMember(tx, { isAdmin: true })
  const deactivated = await addMember(tx, { level: 'experienced', status: 'deactivated' })
  const outsider = await addAuthUser(tx)

  const shared = await addGroup(tx)
  const ownerOnly = await addGroup(tx)
  const otherGroup = await addGroup(tx)
  const archivedGroup = await addGroup(tx)
  await addToGroup(tx, shared, owner, sharedViewer, deactivated)
  await addToGroup(tx, ownerOnly, owner)
  await addToGroup(tx, otherGroup, otherViewer)
  await addToGroup(tx, archivedGroup, owner, sharedViewer)

  const sharedActivity = await activity(tx, shared, 'Shared activity')
  await addParticipant(tx, sharedActivity, owner, 'observer')
  await task(tx, sharedActivity, 'Shared task', { assigneeId: owner })

  const ownerOnlyActivity = await activity(tx, ownerOnly, 'Own group activity')
  await addParticipant(tx, ownerOnlyActivity, owner)
  await task(tx, ownerOnlyActivity, 'Own group task', { assigneeId: owner })

  const archivedGroupActivity = await activity(tx, archivedGroup, 'Archived group activity')
  await addParticipant(tx, archivedGroupActivity, owner)
  await task(tx, archivedGroupActivity, 'Archived group task', { assigneeId: owner })
  await tx`update public.working_groups set archived_at = now() where id = ${archivedGroup}`

  // Someone else's work in the shared group never shows on the owner's profile.
  const elsewhere = await activity(tx, shared, 'Not the owner activity')
  await addParticipant(tx, elsewhere, sharedViewer)
  await task(tx, elsewhere, 'Not the owner task', { assigneeId: sharedViewer })

  return {
    owner,
    sharedViewer,
    otherViewer,
    loneViewer,
    admin,
    deactivated,
    outsider,
    shared,
    ownerOnly,
    otherGroup,
    archivedGroup,
    sharedActivity,
  }
}

const SHARED = ['Shared activity', 'Shared task']
const OWN_GROUP = ['Own group activity', 'Own group task']
const ALL_VISIBLE = [...SHARED, ...OWN_GROUP].sort()

describe('get_profile_work: who sees what', () => {
  it('self: sees their items in all their groups', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await feedWorld(tx)
      expect(titles(await feedAs(tx, w.owner, w.owner))).toEqual(ALL_VISIBLE)
    }))

  it('self: does not see items of a group they have left', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await feedWorld(tx)
      await tx`delete from public.wg_members where group_id = ${w.ownerOnly} and user_id = ${w.owner}`
      expect(titles(await feedAs(tx, w.owner, w.owner))).toEqual(SHARED)
    }))

  it('a member of a shared group sees only that group’s items', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await feedWorld(tx)
      const rows = await feedAs(tx, w.sharedViewer, w.owner)
      expect(titles(rows)).toEqual(SHARED)
      expect(new Set(rows.map((row) => row.group_id))).toEqual(new Set([w.shared]))
    }))

  it('a member of a shared group loses the items when they leave it', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await feedWorld(tx)
      await tx`delete from public.wg_members where group_id = ${w.shared} and user_id = ${w.sharedViewer}`
      expect(await feedAs(tx, w.sharedViewer, w.owner)).toEqual([])
    }))

  it('a member of a group the owner is not in sees nothing', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await feedWorld(tx)
      expect(await feedAs(tx, w.otherViewer, w.owner)).toEqual([])
    }))

  it('a member of a group the owner is not in sees the items once they join one of the owner’s groups', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await feedWorld(tx)
      await addToGroup(tx, w.ownerOnly, w.otherViewer)
      expect(titles(await feedAs(tx, w.otherViewer, w.owner))).toEqual(OWN_GROUP)
    }))

  it('an active member in no group sees nothing', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await feedWorld(tx)
      expect(await feedAs(tx, w.loneViewer, w.owner)).toEqual([])
    }))

  it('an active member in no group still sees their own (empty) feed without error', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await feedWorld(tx)
      expect(await feedAs(tx, w.loneViewer, w.loneViewer)).toEqual([])
    }))

  it('an admin sees the items of every non-archived group', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await feedWorld(tx)
      expect(titles(await feedAs(tx, w.admin, w.owner))).toEqual(ALL_VISIBLE)
    }))

  it('an admin who is deactivated sees nothing', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await feedWorld(tx)
      await tx`update public.users set status = 'deactivated' where id = ${w.admin}`
      expect(await feedAs(tx, w.admin, w.owner)).toEqual([])
    }))

  it('a deactivated viewer sees nothing, even in a shared group', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await feedWorld(tx)
      expect(await feedAs(tx, w.deactivated, w.owner)).toEqual([])
    }))

  it('a deactivated viewer sees the items again once reactivated', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await feedWorld(tx)
      await tx`update public.users set status = 'active' where id = ${w.deactivated}`
      expect(titles(await feedAs(tx, w.deactivated, w.owner))).toEqual(SHARED)
    }))

  it('someone signed in who is not a member sees nothing', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await feedWorld(tx)
      expect(await feedAs(tx, w.outsider, w.owner)).toEqual([])
    }))

  it('anon may not call the function; authenticated may', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await feedWorld(tx)
      await actAs(tx, { role: 'anon' })
      expect(await isDenied(tx, () => tx`select * from public.get_profile_work(${w.owner})`)).toBe(
        true,
      )
      await actAs(tx, { role: 'authenticated', userId: w.sharedViewer })
      expect(await isDenied(tx, () => tx`select * from public.get_profile_work(${w.owner})`)).toBe(
        false,
      )
    }))

  it('a deactivated owner returns nothing, to anyone', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await feedWorld(tx)
      await tx`update public.users set status = 'deactivated' where id = ${w.owner}`
      expect(await feedAs(tx, w.admin, w.owner)).toEqual([])
      expect(await feedAs(tx, w.sharedViewer, w.owner)).toEqual([])
    }))

  it('an owner who is not a member returns nothing', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await feedWorld(tx)
      expect(await feedAs(tx, w.admin, w.outsider)).toEqual([])
    }))
})

describe('get_profile_work: which items', () => {
  it('excludes archived groups, even for the owner and admins', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await feedWorld(tx)
      for (const viewer of [w.owner, w.admin, w.sharedViewer]) {
        const rows = await feedAs(tx, viewer, w.owner)
        expect(rows.some((row) => row.group_id === w.archivedGroup)).toBe(false)
      }
    }))

  it('includes the group again when it is restored', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await feedWorld(tx)
      await tx`update public.working_groups set archived_at = null where id = ${w.archivedGroup}`
      expect(titles(await feedAs(tx, w.owner, w.owner))).toEqual(
        [...ALL_VISIBLE, 'Archived group activity', 'Archived group task'].sort(),
      )
    }))

  it('excludes the General activity but includes tasks inside it', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await feedWorld(tx)
      const general = await generalActivityOf(tx, w.shared)
      await addParticipant(tx, general, w.owner)
      await task(tx, general, 'General task', { assigneeId: w.owner })
      const rows = await feedAs(tx, w.sharedViewer, w.owner)
      expect(rows.some((row) => row.id === general)).toBe(false)
      expect(titles(rows)).toEqual([...SHARED, 'General task'].sort())
    }))

  it('excludes archived and cancelled activities and the tasks of archived activities', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await feedWorld(tx)
      const archived = await activity(tx, w.shared, 'Archived activity')
      await addParticipant(tx, archived, w.owner)
      await task(tx, archived, 'Task of archived activity', { assigneeId: w.owner })
      await tx`update public.activities set archived_at = now() where id = ${archived}`
      const cancelled = await activity(tx, w.shared, 'Cancelled activity', { status: 'cancelled' })
      await addParticipant(tx, cancelled, w.owner)
      expect(titles(await feedAs(tx, w.owner, w.owner))).toEqual(ALL_VISIBLE)
    }))

  it('lists an activity the owner leads and takes part in once', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await feedWorld(tx)
      const planned = await activity(tx, w.shared, 'Led activity', { status: 'planned' })
      await addParticipant(tx, planned, w.owner)
      await tx`update public.activities set lead_id = ${w.owner} where id = ${planned}`
      const rows = await feedAs(tx, w.sharedViewer, w.owner)
      expect(rows.filter((row) => row.title === 'Led activity')).toHaveLength(1)
    }))

  it('keeps done items for 90 days and drops them after', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await feedWorld(tx)
      const recent = await activity(tx, w.shared, 'Recently done activity', {
        status: 'done',
        updatedAt: new Date(Date.now() - 80 * 86_400_000),
      })
      const old = await activity(tx, w.shared, 'Long done activity', {
        status: 'done',
        updatedAt: new Date(Date.now() - 100 * 86_400_000),
      })
      await addParticipant(tx, recent, w.owner)
      await addParticipant(tx, old, w.owner)
      const recentTask = await task(tx, w.sharedActivity, 'Recently done task', {
        assigneeId: w.owner,
        status: 'done',
      })
      const oldTask = await task(tx, w.sharedActivity, 'Long done task', {
        assigneeId: w.owner,
        status: 'done',
      })
      await completedDaysAgo(tx, recentTask, 80)
      await completedDaysAgo(tx, oldTask, 100)
      // Planned activities stay however old their last update is.
      const stale = await activity(tx, w.shared, 'Old planned activity', {
        status: 'planned',
        updatedAt: new Date(Date.now() - 400 * 86_400_000),
      })
      await addParticipant(tx, stale, w.owner)

      const seen = titles(await feedAs(tx, w.sharedViewer, w.owner))
      expect(seen).toEqual(
        [...SHARED, 'Recently done activity', 'Recently done task', 'Old planned activity'].sort(),
      )
    }))

  it('lists current items first, then the most recently updated, at most 30 rows', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await feedWorld(tx)
      const done = await task(tx, w.sharedActivity, 'Done task', {
        assigneeId: w.owner,
        status: 'done',
      })
      await completedDaysAgo(tx, done, 1)
      for (let i = 0; i < 35; i++) {
        await task(tx, w.sharedActivity, `Bulk task ${i}`, { assigneeId: w.owner })
      }
      const rows = await feedAs(tx, w.owner, w.owner)
      expect(rows).toHaveLength(30)
      expect(rows.some((row) => row.status === 'done')).toBe(false)
    }))

  it('returns the columns the page needs and no names of people', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await feedWorld(tx)
      await actAs(tx, { role: 'authenticated', userId: w.sharedViewer })
      const [row] = await tx`
        select * from public.get_profile_work(${w.owner}) where kind = 'task' limit 1`
      expect(Object.keys(row ?? {}).sort()).toEqual(
        [
          'activity_id',
          'activity_title',
          'due_on',
          'group_id',
          'group_name',
          'group_slug',
          'id',
          'kind',
          'status',
          'title',
          'updated_at',
        ].sort(),
      )
      expect(row?.activity_title).toBe('Shared activity')
    }))
})

describe('get_profile_work: definition', () => {
  it('is a stable security-definer function with an empty search_path', () =>
    inRolledBackTransaction(async (tx) => {
      const [fn] = await tx`
        select p.provolatile as volatility, p.prosecdef as definer, p.proconfig as config
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'get_profile_work'`
      expect(fn).toEqual({ volatility: 's', definer: true, config: ['search_path=""'] })
    }))

  it('changes no data', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await feedWorld(tx)
      const snapshot = () => tx`
        select
          (select md5(coalesce(string_agg(a::text, ',' order by a.id), '')) from public.activities a)
            as activities,
          (select md5(coalesce(string_agg(t::text, ',' order by t.id), '')) from public.tasks t)
            as tasks,
          (select count(*) from public.activity_participants) as participants,
          (select md5(coalesce(string_agg(u::text, ',' order by u.id), '')) from public.users u)
            as users`
      const before = await snapshot()
      for (const viewer of [w.owner, w.sharedViewer, w.admin, w.otherViewer]) {
        await feedAs(tx, viewer, w.owner)
      }
      expect(await snapshot()).toEqual(before)
    }))
})
