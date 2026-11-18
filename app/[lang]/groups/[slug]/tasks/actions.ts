'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/lib/authz'
import { requireWgMember } from '@/lib/authz/wg'
import { refusalFromDbCode } from '@/lib/domain/activities'
import { isValidSlug } from '@/lib/domain/groups'
import {
  TASK_STATUSES,
  canAssignTask,
  canEditTaskFields,
  canTake,
  completionSchema,
  nextStatuses,
  taskFieldsSchema,
  taskInputSchema,
  type TaskActor,
  type TaskStatus,
} from '@/lib/domain/tasks'
import { sendTaskAssignedEmail } from '@/lib/email/notify'
import { createClient } from '@/lib/supabase/server'
import { onTaskCompleted } from '@/lib/tasks/on-task-completed'

export type TaskActionState = {
  status:
    | 'idle'
    | 'done'
    /** Saved, but the assignment email could not be sent. */
    | 'doneEmailFailed'
    | 'invalid'
    | 'needsEvidence'
    | 'notAllowed'
    | 'notFound'
    | 'conflict'
    | 'unavailable'
}

const text = (formData: FormData, key: string) => {
  const value = formData.get(key)
  return typeof value === 'string' ? value : ''
}

const groupTarget = z.object({ groupId: z.uuid(), slug: z.string().refine(isValidSlug) })
const taskTarget = groupTarget.extend({ taskId: z.uuid() })

function refreshTasks() {
  revalidatePath('/groups/[slug]', 'page')
  revalidatePath('/groups/[slug]/activities/[id]', 'page')
  revalidatePath('/tasks')
}

/**
 * Emails the new assignee after the assignment was saved. Nothing is sent when nobody is assigned or
 * when the person assigned themselves; a failed email never undoes the assignment, it only turns
 * the result into the neutral "saved, but the email could not be sent" note.
 */
async function notifyAssignee(
  assigneeId: string | null,
  actorId: string,
  assignerName: string,
  task: {
    groupId: string
    slug: string
    activityId: string
    title: string
    dueOn: string | null
  },
): Promise<TaskActionState> {
  if (assigneeId === null || assigneeId === actorId) return { status: 'done' }
  const sent = await sendTaskAssignedEmail({ assigneeId, assignerName, ...task })
  return { status: sent ? 'done' : 'doneEmailFailed' }
}

const fromDbCode = (code: string | undefined): TaskActionState => ({
  status: refusalFromDbCode(code),
})

/**
 * Creates a task in an activity of the group. Fresh and experienced members of the group and admins
 * may (a `new` volunteer gets the 404 from `requireWgMember`); the database refuses anyone else
 * again, and refuses an assignee who is not a member of the group. The task is created for the group
 * of the activity: the activity is read with the RLS client first.
 */
export async function createTask(
  _previous: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  await requireUser()
  const target = groupTarget.extend({ activityId: z.uuid() }).safeParse({
    groupId: text(formData, 'groupId'),
    slug: text(formData, 'slug'),
    activityId: text(formData, 'activityId'),
  })
  if (!target.success) return { status: 'invalid' }
  const { groupId, activityId } = target.data

  const { member } = await requireWgMember(groupId, 'fresh')

  const supabase = await createClient()
  const { data: activity } = await supabase
    .from('activities')
    .select('id, archived_at')
    .eq('id', activityId)
    .eq('group_id', groupId)
    .maybeSingle()
  if (!activity) return { status: 'notFound' }
  if (activity.archived_at) return { status: 'conflict' }

  const input = taskInputSchema.safeParse({
    title: text(formData, 'title'),
    description: text(formData, 'description'),
    dueOn: text(formData, 'dueOn'),
    assigneeId: text(formData, 'assigneeId'),
  })
  if (!input.success) return { status: 'invalid' }

  const { error } = await supabase.from('tasks').insert({
    activity_id: activity.id,
    group_id: groupId,
    title: input.data.title,
    description: input.data.description ?? null,
    due_on: input.data.dueOn ?? null,
    assignee_id: input.data.assigneeId,
    created_by: member.id,
  })
  if (error) return fromDbCode(error.code)

  refreshTasks()
  return notifyAssignee(input.data.assigneeId, member.id, member.displayName, {
    groupId,
    slug: target.data.slug,
    activityId: activity.id,
    title: input.data.title,
    dueOn: input.data.dueOn ?? null,
  })
}

type LoadedTask = {
  id: string
  status: TaskStatus
  assigneeId: string | null
  activityId: string
  title: string
  dueOn: string | null
}

/**
 * The common start of every action on one task: sign-in, then membership of the group (an admin
 * passes), then the task itself, read with the RLS client so a person who may not see it gets "not
 * found". Returns who the person is in relation to the task, for the pure rules.
 */
async function loadTask(formData: FormData): Promise<
  | {
      ok: true
      userId: string
      displayName: string
      groupId: string
      slug: string
      actor: TaskActor
      task: LoadedTask
    }
  | { ok: false; state: TaskActionState }
> {
  await requireUser()
  const target = taskTarget.safeParse({
    groupId: text(formData, 'groupId'),
    slug: text(formData, 'slug'),
    taskId: text(formData, 'taskId'),
  })
  if (!target.success) return { ok: false, state: { status: 'invalid' } }
  const { member, membership } = await requireWgMember(target.data.groupId)

  const supabase = await createClient()
  const { data } = await supabase
    .from('tasks')
    .select('id, status, assignee_id, created_by, activity_id, title, due_on')
    .eq('id', target.data.taskId)
    .eq('group_id', target.data.groupId)
    .maybeSingle()
  if (!data) return { ok: false, state: { status: 'notFound' } }

  return {
    ok: true,
    userId: member.id,
    displayName: member.displayName,
    groupId: target.data.groupId,
    slug: target.data.slug,
    actor: {
      level: member.level,
      isAdmin: member.isAdmin,
      isMember: membership !== null,
      isCreator: data.created_by === member.id,
      isAssignee: data.assignee_id === member.id,
    },
    task: {
      id: data.id,
      status: data.status,
      assigneeId: data.assignee_id,
      activityId: data.activity_id,
      title: data.title,
      dueOn: data.due_on,
    },
  }
}

/** Takes an unassigned task: any member of the group, and nothing else about it changes. */
export async function takeTask(
  _previous: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const loaded = await loadTask(formData)
  if (!loaded.ok) return loaded.state
  const { actor, task, userId } = loaded
  if (task.assigneeId !== null) return { status: 'conflict' }
  if (!canTake(actor, task)) return { status: 'notAllowed' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tasks')
    .update({ assignee_id: userId })
    .eq('id', task.id)
    .is('assignee_id', null)
    .select('id')
    .maybeSingle()
  if (error) return fromDbCode(error.code)
  // Someone else took it between the read and the write.
  if (!data) return { status: 'conflict' }

  refreshTasks()
  return { status: 'done' }
}

/**
 * Assigns or reassigns a task (empty user id: no assignee). The creator, the assignee, experienced
 * members and admins may; the database also checks that the assignee is a member of the group.
 */
export async function assignTask(
  _previous: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const loaded = await loadTask(formData)
  if (!loaded.ok) return loaded.state
  const { actor, task } = loaded
  const raw = text(formData, 'assigneeId')
  const assignee = raw === '' ? { success: true as const, data: null } : z.uuid().safeParse(raw)
  if (!assignee.success) return { status: 'invalid' }
  if (!canAssignTask(actor, task)) return { status: 'notAllowed' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tasks')
    .update({ assignee_id: assignee.data })
    .eq('id', task.id)
    .select('id')
    .maybeSingle()
  if (error) return fromDbCode(error.code)
  if (!data) return { status: 'notAllowed' }

  refreshTasks()
  // Giving the task to the person who already has it is not a new assignment: no email.
  if (assignee.data === task.assigneeId) return { status: 'done' }
  return notifyAssignee(assignee.data, loaded.userId, loaded.displayName, {
    groupId: loaded.groupId,
    slug: loaded.slug,
    activityId: task.activityId,
    title: task.title,
    dueOn: task.dueOn,
  })
}

/** Edits the title, description and due date of a task (not the assignee or the status). */
export async function updateTask(
  _previous: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const loaded = await loadTask(formData)
  if (!loaded.ok) return loaded.state
  const { actor, task } = loaded
  const fields = taskFieldsSchema.safeParse({
    title: text(formData, 'title'),
    description: text(formData, 'description'),
    dueOn: text(formData, 'dueOn'),
  })
  if (!fields.success) return { status: 'invalid' }
  if (!canEditTaskFields(actor, task)) {
    return { status: 'notAllowed' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tasks')
    .update({
      title: fields.data.title,
      description: fields.data.description ?? null,
      due_on: fields.data.dueOn ?? null,
    })
    .eq('id', task.id)
    .select('id')
    .maybeSingle()
  if (error) return fromDbCode(error.code)
  if (!data) return { status: 'notAllowed' }

  refreshTasks()
  return { status: 'done' }
}

/**
 * Moves a task to open, in progress or done. Done needs a note or an https link and only the
 * assignee (or an admin) may do it; leaving done (reopening) is for admins. Completing calls
 * `onTaskCompleted`, the seam for M3c's level re-evaluation.
 */
export async function setTaskStatus(
  _previous: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const loaded = await loadTask(formData)
  if (!loaded.ok) return loaded.state
  const { actor, task } = loaded
  const status = z.enum(TASK_STATUSES).safeParse(text(formData, 'status'))
  if (!status.success) return { status: 'invalid' }
  if (status.data === task.status) return { status: 'conflict' }
  if (!nextStatuses(actor, task).includes(status.data)) return { status: 'notAllowed' }

  let completion: { completion_note: string | null; completion_url: string | null } | null = null
  if (status.data === 'done') {
    const evidence = completionSchema.safeParse({
      note: text(formData, 'note'),
      url: text(formData, 'url'),
    })
    if (!evidence.success) {
      const blank = text(formData, 'note').trim() === '' && text(formData, 'url').trim() === ''
      return { status: blank ? 'needsEvidence' : 'invalid' }
    }
    completion = {
      completion_note: evidence.data.note ?? null,
      completion_url: evidence.data.url ?? null,
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tasks')
    .update({ status: status.data, ...completion })
    .eq('id', task.id)
    .eq('status', task.status)
    .select('id')
    .maybeSingle()
  if (error) return fromDbCode(error.code)
  // The task changed between the read and the write.
  if (!data) return { status: 'conflict' }

  if (status.data === 'done') await onTaskCompleted(task.id)

  refreshTasks()
  return { status: 'done' }
}
