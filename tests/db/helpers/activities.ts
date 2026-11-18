// Synthetic activities, participants and tasks for the database tests. Call these as the
// superuser, before actAs().
import type { ActivityActor, ParticipantRole } from '@/lib/domain/activities'
import type { Tx } from './db'
import { actor, addToGroup, type Role, world } from './groups'
import { addMember } from './members'

export async function generalActivityOf(tx: Tx, groupId: string): Promise<string> {
  const [row] = await tx`
    select id from public.activities where group_id = ${groupId} and is_general`
  return row?.id
}

export async function addActivity(
  tx: Tx,
  groupId: string,
  options: { createdBy?: string; type?: string; title?: string } = {},
): Promise<string> {
  const [row] = await tx`
    insert into public.activities (group_id, type, title, created_by)
    values (${groupId}, ${options.type ?? 'campaign'}, ${options.title ?? 'Synthetic activity'},
      ${options.createdBy ?? null})
    returning id`
  return row?.id
}

export async function addParticipant(
  tx: Tx,
  activityId: string,
  userId: string,
  role: ParticipantRole = 'participant',
): Promise<void> {
  await tx`
    insert into public.activity_participants (activity_id, user_id, role)
    values (${activityId}, ${userId}, ${role})`
}

export async function addTask(
  tx: Tx,
  activityId: string,
  options: { assigneeId?: string; createdBy?: string } = {},
): Promise<string> {
  // The sync_task_group trigger would set group_id anyway; passing it keeps the insert readable.
  const [row] = await tx`
    insert into public.tasks (activity_id, group_id, title, assignee_id, created_by)
    select ${activityId}, a.group_id, 'Synthetic task', ${options.assigneeId ?? null},
      ${options.createdBy ?? null}
    from public.activities a where a.id = ${activityId}
    returning id`
  return row?.id
}

/** Runs a statement that must fail, inside a savepoint, and returns the database's message. */
export async function errorOf(tx: Tx, statement: () => Promise<unknown>): Promise<string | null> {
  try {
    await tx.savepoint(async () => {
      await statement()
    })
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

/** Runs a statement that must fail, inside a savepoint, and returns the error code (null if none). */
export async function errorCodeOf(
  tx: Tx,
  statement: () => Promise<unknown>,
): Promise<string | null> {
  try {
    await tx.savepoint(async () => {
      await statement()
    })
    return null
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown'
  }
}

/**
 * The W-01 world plus: a second fresh member, the General activity, an activity created by the
 * fresh member (who takes part in it), one created by the experienced member, an archived one with
 * no creator, and two tasks created by the fresh member: one open and unassigned, one assigned to
 * the new member.
 */
export async function activityWorld(tx: Tx) {
  const w = await world(tx)
  const fresh = w.ids['fresh member'] as string
  const otherFresh = await addMember(tx, { level: 'fresh' })
  await addToGroup(tx, w.group, otherFresh)
  const general = await generalActivityOf(tx, w.group)
  const activity = await addActivity(tx, w.group, { createdBy: fresh })
  const others = await addActivity(tx, w.group, {
    createdBy: w.ids['experienced member'],
    title: 'Created by someone else',
  })
  const archived = await addActivity(tx, w.group, { title: 'Archived' })
  await tx`update public.activities set archived_at = now() where id = ${archived}`
  await addParticipant(tx, activity, fresh)
  const open = await addTask(tx, activity, { createdBy: fresh })
  const assigned = await addTask(tx, activity, {
    createdBy: fresh,
    assigneeId: w.ids['new member'],
  })
  return { ...w, fresh, otherFresh, general, activity, others, archived, open, assigned }
}

/** In activityWorld the fresh member created `activity` and both tasks. */
export const isFresh = (role: Role) => role.name === 'fresh member'

/** What the activity rules see of a role, for `activity` in activityWorld. */
export const editsAsCreator = (role: Role): ActivityActor => ({
  ...actor(role),
  isCreator: isFresh(role),
  isLead: false,
})
