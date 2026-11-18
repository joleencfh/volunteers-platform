// Task permissions, status moves and input checks (spec sections 3 and 5). Pure: no I/O.
// The same rules live in SQL (guard_task_write in
// supabase/migrations/20261117152524_activities_policies.sql); tests/db/tasks-rls.test.ts fails if the
// two drift. Decisions: docs/adr/0019 ("Access").
import { z } from 'zod'
import {
  TASK_COMPLETION_NOTE_MAX_LENGTH,
  TASK_DESCRIPTION_MAX_LENGTH,
  TASK_STATUSES,
  TASK_TITLE_MAX_LENGTH,
  canCreateInGroup,
  type TaskStatus,
} from './activities'
import { httpsUrl } from './activity-types/common'
import type { GroupActor } from './groups'

export { TASK_STATUSES, type TaskStatus }

/** Who is asking about one task: their place in its group, and their link to the task. */
export type TaskActor = GroupActor & {
  isCreator: boolean
  isAssignee: boolean
}

/** The part of a task the rules look at. */
export type TaskState = { status: TaskStatus; assigneeId: string | null }

/** Fresh and experienced members of the group, and admins; a new volunteer cannot create tasks. */
export const canCreateTask = canCreateInGroup

/** Any member of the group takes an unassigned task that is not done. */
export function canTake(actor: GroupActor, task: TaskState): boolean {
  return actor.isMember && task.assigneeId === null && task.status !== 'done'
}

/** The creator, the assignee, experienced members of the group, and admins. */
export function canEditTask(actor: TaskActor): boolean {
  if (actor.isAdmin) return true
  return actor.isMember && (actor.isCreator || actor.isAssignee || actor.level === 'experienced')
}

/**
 * Editors change the title, description and due date of a task that is not done; only an admin
 * edits a done task. (The database is looser here: it lets an editor change these fields on a done
 * task, since the status, assignee and completion are what it locks. The action follows this rule.)
 */
export function canEditTaskFields(actor: TaskActor, task: TaskState): boolean {
  return actor.isAdmin || (task.status !== 'done' && canEditTask(actor))
}

/** Editors assign or reassign any task that is not done; only an admin changes a done one. */
export function canAssignTask(actor: TaskActor, task: TaskState): boolean {
  if (actor.isAdmin) return true
  return task.status !== 'done' && canEditTask(actor)
}

/** The assignee, or an admin, completes a task that has an assignee and is not done yet. */
export function canComplete(actor: TaskActor, task: TaskState): boolean {
  if (task.status === 'done' || task.assigneeId === null) return false
  return actor.isAdmin || (actor.isMember && actor.isAssignee)
}

/** Only an admin reopens a done task. */
export function canReopen(actor: TaskActor, task: TaskState): boolean {
  return actor.isAdmin && task.status === 'done'
}

/**
 * The statuses a person may move the task to from where it is now. Done is listed when the person may
 * complete it (the completion note or link is checked separately); leaving done is an admin's move.
 */
export function nextStatuses(actor: TaskActor, task: TaskState): TaskStatus[] {
  if (task.status === 'done') return canReopen(actor, task) ? ['open', 'in_progress'] : []
  const next: TaskStatus[] = []
  if (canEditTask(actor)) {
    for (const status of ['open', 'in_progress'] as const) {
      if (status !== task.status) next.push(status)
    }
  }
  if (canComplete(actor, task)) next.push('done')
  return next
}

// Input ----------------------------------------------------------------------------------------------

const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

export const taskFieldsSchema = z.object({
  title: z.string().trim().min(1).max(TASK_TITLE_MAX_LENGTH),
  description: z.preprocess(
    blankToUndefined,
    z.string().trim().max(TASK_DESCRIPTION_MAX_LENGTH).optional(),
  ),
  dueOn: z.preprocess(blankToUndefined, z.iso.date().optional()),
})

/** A task as created: the fields plus the assignee (a user id, or none). */
export const taskInputSchema = taskFieldsSchema.extend({
  assigneeId: z.preprocess(blankToUndefined, z.uuid().nullable().default(null)),
})

export type TaskFields = z.infer<typeof taskFieldsSchema>
export type TaskInput = z.infer<typeof taskInputSchema>

/** Completing needs a note, a link, or both (mirrors the tasks_done_needs_note_or_link constraint). */
export const completionSchema = z
  .object({
    note: z.preprocess(
      blankToUndefined,
      z.string().trim().max(TASK_COMPLETION_NOTE_MAX_LENGTH).optional(),
    ),
    url: z.preprocess(blankToUndefined, httpsUrl.optional()),
  })
  .refine((value) => value.note !== undefined || value.url !== undefined)

export type Completion = z.infer<typeof completionSchema>

// Lists ------------------------------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** `me` and `unassigned` are fixed words; anything else must be a user id. */
export type AssigneeFilter = 'me' | 'unassigned' | { userId: string }

export type TaskFilters = { status: TaskStatus | null; assignee: AssigneeFilter | null }

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

/** The `?status=` and `?assignee=` of the Tasks tab; anything unknown or repeated is ignored. */
export function parseTaskFilters(params: {
  status?: string | string[]
  assignee?: string | string[]
}): TaskFilters {
  const status = first(params.status)
  const assignee = first(params.assignee)
  return {
    status: TASK_STATUSES.find((candidate) => candidate === status) ?? null,
    assignee:
      assignee === 'me' || assignee === 'unassigned'
        ? assignee
        : assignee !== undefined && UUID.test(assignee)
          ? { userId: assignee.toLowerCase() }
          : null,
  }
}

/** The form value of the assignee filter (the inverse of `parseTaskFilters`). */
export function assigneeFilterValue(filter: AssigneeFilter | null): string {
  if (filter === null) return ''
  return typeof filter === 'string' ? filter : filter.userId
}

/** Soonest due first, tasks without a due date last, then oldest first. */
export function compareByDue(
  a: { due_on: string | null; created_at: string },
  b: { due_on: string | null; created_at: string },
): number {
  if (a.due_on !== b.due_on) {
    if (a.due_on === null) return 1
    if (b.due_on === null) return -1
    return a.due_on < b.due_on ? -1 : 1
  }
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0
}
