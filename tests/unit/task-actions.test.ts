import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

let signedIn = true
let allowed = true
let level = 'fresh'
let isAdmin = false
let isMember = true
const order: string[] = []
vi.mock('@/lib/authz', () => ({
  requireUser: async () => {
    order.push('requireUser')
    if (!signedIn) throw new Error('REDIRECT /login')
    return { id: ME, level, isAdmin, displayName: 'Mia' }
  },
}))
vi.mock('@/lib/authz/wg', () => ({
  requireWgMember: async (_group: string, minLevel?: string) => {
    order.push(`requireWgMember:${minLevel ?? 'any'}`)
    if (!allowed) throw new Error('NOT_FOUND')
    return {
      member: { id: ME, level, isAdmin, displayName: 'Mia' },
      membership: isMember ? { groupId: GROUP, joinedAt: 'x' } : null,
    }
  },
}))

let emailSent = true
const sendEmail = vi.fn(async (_input: unknown) => emailSent)
vi.mock('@/lib/email/notify', () => ({
  sendTaskAssignedEmail: (input: unknown) => sendEmail(input),
}))

const completed = vi.fn()
vi.mock('@/lib/tasks/on-task-completed', () => ({
  onTaskCompleted: (id: string) => {
    order.push('onTaskCompleted')
    completed(id)
  },
}))

const ME = 'a1b2c3d4-0000-4000-8000-0000000000aa'
const OTHER = 'a1b2c3d4-0000-4000-8000-0000000000bb'
const GROUP = '8b1c2f3e-4d5a-4b6c-8d7e-9f0a1b2c3d4e'
const ACTIVITY = 'a1b2c3d4-0000-4000-8000-000000000001'
const TASK = 'a1b2c3d4-0000-4000-8000-000000000002'

type TaskRow = {
  id: string
  status: 'open' | 'in_progress' | 'done'
  assignee_id: string | null
  created_by: string | null
  activity_id?: string
  title?: string
  due_on?: string | null
}
let task: TaskRow | null
let activity: { id: string; archived_at: string | null } | null
let writeResult: { data: { id: string } | null; error: { code: string } | null }
const inserted = vi.fn()
const updated = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => ({
      select: () => {
        order.push(`select:${table}`)
        const chain = {
          eq: () => chain,
          maybeSingle: async () => ({ data: table === 'tasks' ? task : activity }),
        }
        return chain
      },
      insert: async (payload: unknown) => {
        order.push(`insert:${table}`)
        inserted(table, payload)
        return { error: writeResult.error }
      },
      update: (payload: unknown) => {
        order.push(`update:${table}`)
        updated(table, payload)
        const chain = {
          eq: () => chain,
          is: () => chain,
          select: () => chain,
          maybeSingle: async () => writeResult,
        }
        return chain
      },
    }),
  }),
}))

import {
  assignTask,
  createTask,
  setTaskStatus,
  takeTask,
  updateTask,
} from '@/app/[lang]/groups/[slug]/tasks/actions'

const idle = { status: 'idle' as const }
const form = (values: Record<string, string>) => {
  const data = new FormData()
  data.set('groupId', GROUP)
  data.set('slug', 'lobbying')
  data.set('activityId', ACTIVITY)
  data.set('taskId', TASK)
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}
const newTask = (extra: Record<string, string> = {}) =>
  form({ title: 'Write the letter', ...extra })

beforeEach(() => {
  vi.clearAllMocks()
  order.length = 0
  signedIn = true
  allowed = true
  level = 'fresh'
  isAdmin = false
  isMember = true
  emailSent = true
  task = {
    id: TASK,
    status: 'open',
    assignee_id: null,
    created_by: OTHER,
    activity_id: ACTIVITY,
    title: 'Existing task',
    due_on: '2026-12-05',
  }
  activity = { id: ACTIVITY, archived_at: null }
  writeResult = { data: { id: TASK }, error: null }
})

describe('authorisation comes first in every action', () => {
  const actions = {
    createTask: () => createTask(idle, newTask()),
    takeTask: () => takeTask(idle, form({})),
    assignTask: () => assignTask(idle, form({ assigneeId: OTHER })),
    updateTask: () => updateTask(idle, form({ title: 'New title' })),
    setTaskStatus: () => setTaskStatus(idle, form({ status: 'in_progress' })),
  }
  for (const [name, run] of Object.entries(actions)) {
    it(`${name}: requireUser, then the group check, before anything is read or written`, async () => {
      await run()
      expect(order[0]).toBe('requireUser')
      expect(order[1]).toMatch(/^requireWgMember/)
    })

    it(`${name}: sends a signed-out visitor to the login page and writes nothing`, async () => {
      signedIn = false
      await expect(run()).rejects.toThrow('REDIRECT /login')
      expect(inserted).not.toHaveBeenCalled()
      expect(updated).not.toHaveBeenCalled()
    })

    it(`${name}: a person outside the group gets not-found and writes nothing`, async () => {
      allowed = false
      await expect(run()).rejects.toThrow('NOT_FOUND')
      expect(inserted).not.toHaveBeenCalled()
      expect(updated).not.toHaveBeenCalled()
    })
  }

  it('createTask asks for fresh level, so a new volunteer never gets past the group check', async () => {
    await createTask(idle, newTask())
    expect(order[1]).toBe('requireWgMember:fresh')
  })

  for (const name of ['takeTask', 'assignTask', 'updateTask', 'setTaskStatus'] as const) {
    it(`${name}: a task the person cannot see is not found`, async () => {
      task = null
      const run = {
        takeTask: () => takeTask(idle, form({})),
        assignTask: () => assignTask(idle, form({ assigneeId: OTHER })),
        updateTask: () => updateTask(idle, form({ title: 'x' })),
        setTaskStatus: () => setTaskStatus(idle, form({ status: 'in_progress' })),
      }[name]
      expect(await run()).toEqual({ status: 'notFound' })
      expect(updated).not.toHaveBeenCalled()
    })
  }
})

describe('createTask', () => {
  it('creates a task for the group of the activity, with the creator and the assignee', async () => {
    const state = await createTask(
      idle,
      newTask({ description: 'Short text', dueOn: '2026-12-01', assigneeId: OTHER }),
    )
    expect(state).toEqual({ status: 'done' })
    expect(inserted).toHaveBeenCalledWith('tasks', {
      activity_id: ACTIVITY,
      group_id: GROUP,
      title: 'Write the letter',
      description: 'Short text',
      due_on: '2026-12-01',
      assignee_id: OTHER,
      created_by: ME,
    })
  })

  it('creates an unassigned task when no assignee is chosen', async () => {
    await createTask(idle, newTask())
    expect(inserted).toHaveBeenCalledWith(
      'tasks',
      expect.objectContaining({ assignee_id: null, description: null, due_on: null }),
    )
  })

  it('refuses invalid input with a typed state and writes nothing', async () => {
    expect(await createTask(idle, newTask({ title: '  ' }))).toEqual({ status: 'invalid' })
    expect(await createTask(idle, newTask({ assigneeId: 'nope' }))).toEqual({ status: 'invalid' })
    expect(await createTask(idle, newTask({ dueOn: 'tomorrow' }))).toEqual({ status: 'invalid' })
    expect(inserted).not.toHaveBeenCalled()
  })

  it('refuses a malformed group, an unknown activity and an archived one', async () => {
    const bad = form({ title: 'Task' })
    bad.set('groupId', 'nope')
    expect(await createTask(idle, bad)).toEqual({ status: 'invalid' })
    activity = null
    expect(await createTask(idle, newTask())).toEqual({ status: 'notFound' })
    activity = { id: ACTIVITY, archived_at: '2026-01-01' }
    expect(await createTask(idle, newTask())).toEqual({ status: 'conflict' })
    expect(inserted).not.toHaveBeenCalled()
  })

  it('maps database refusals (a new volunteer, an assignee outside the group)', async () => {
    writeResult = { data: null, error: { code: '42501' } }
    expect(await createTask(idle, newTask())).toEqual({ status: 'notAllowed' })
    writeResult = { data: null, error: { code: '23514' } }
    expect(await createTask(idle, newTask({ assigneeId: OTHER }))).toEqual({ status: 'invalid' })
    writeResult = { data: null, error: { code: 'XX000' } }
    expect(await createTask(idle, newTask())).toEqual({ status: 'unavailable' })
  })
})

describe('createTask: assignment email', () => {
  it('emails a different assignee after the save, passing no address or real name', async () => {
    const state = await createTask(idle, newTask({ dueOn: '2026-12-01', assigneeId: OTHER }))
    expect(state).toEqual({ status: 'done' })
    expect(sendEmail).toHaveBeenCalledWith({
      assigneeId: OTHER,
      assignerName: 'Mia',
      groupId: GROUP,
      slug: 'lobbying',
      activityId: ACTIVITY,
      title: 'Write the letter',
      dueOn: '2026-12-01',
    })
  })

  it('does not email for self-assignment or when nobody is assigned', async () => {
    await createTask(idle, newTask({ assigneeId: ME }))
    await createTask(idle, newTask())
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('does not email when the database refuses the task', async () => {
    writeResult = { data: null, error: { code: '42501' } }
    await createTask(idle, newTask({ assigneeId: OTHER }))
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('keeps the task and returns a neutral note when the email fails', async () => {
    emailSent = false
    expect(await createTask(idle, newTask({ assigneeId: OTHER }))).toEqual({
      status: 'doneEmailFailed',
    })
    expect(inserted).toHaveBeenCalled()
  })
})

describe('assignTask: assignment email', () => {
  beforeEach(() => {
    task = {
      id: TASK,
      status: 'open',
      assignee_id: null,
      created_by: ME,
      activity_id: ACTIVITY,
      title: 'Existing task',
      due_on: null,
    }
  })

  it('emails a new assignee who is someone else', async () => {
    expect(await assignTask(idle, form({ assigneeId: OTHER }))).toEqual({ status: 'done' })
    expect(sendEmail).toHaveBeenCalledWith({
      assigneeId: OTHER,
      assignerName: 'Mia',
      groupId: GROUP,
      slug: 'lobbying',
      activityId: ACTIVITY,
      title: 'Existing task',
      dueOn: null,
    })
  })

  it('does not email on self-assignment, on unassigning or on a no-op', async () => {
    await assignTask(idle, form({ assigneeId: ME }))
    await assignTask(idle, form({ assigneeId: '' }))
    task = { ...task!, assignee_id: OTHER }
    await assignTask(idle, form({ assigneeId: OTHER }))
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('does not email when the assignment is refused', async () => {
    task = { ...task!, created_by: OTHER }
    expect(await assignTask(idle, form({ assigneeId: OTHER }))).toEqual({ status: 'notAllowed' })
    task = { ...task!, created_by: ME }
    writeResult = { data: null, error: { code: '23514' } }
    expect(await assignTask(idle, form({ assigneeId: OTHER }))).toEqual({ status: 'invalid' })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('keeps the assignment and returns a neutral note when the email fails', async () => {
    emailSent = false
    expect(await assignTask(idle, form({ assigneeId: OTHER }))).toEqual({
      status: 'doneEmailFailed',
    })
  })

  it('takeTask never emails: taking is self-assignment', async () => {
    await takeTask(idle, form({}))
    expect(sendEmail).not.toHaveBeenCalled()
  })
})

describe('takeTask', () => {
  it('lets a member take an unassigned task, a new volunteer too', async () => {
    level = 'new'
    expect(await takeTask(idle, form({}))).toEqual({ status: 'done' })
    expect(updated).toHaveBeenCalledWith('tasks', { assignee_id: ME })
  })

  it('refuses a task that already has an assignee, and a done task', async () => {
    task = { id: TASK, status: 'open', assignee_id: OTHER, created_by: ME }
    expect(await takeTask(idle, form({}))).toEqual({ status: 'conflict' })
    task = { id: TASK, status: 'done', assignee_id: null, created_by: ME }
    expect(await takeTask(idle, form({}))).toEqual({ status: 'notAllowed' })
    expect(updated).not.toHaveBeenCalled()
  })

  it('refuses an admin who is not a member of the group', async () => {
    isAdmin = true
    isMember = false
    expect(await takeTask(idle, form({}))).toEqual({ status: 'notAllowed' })
    expect(updated).not.toHaveBeenCalled()
  })

  it('reports a task someone else took in the meantime as a conflict', async () => {
    writeResult = { data: null, error: null }
    expect(await takeTask(idle, form({}))).toEqual({ status: 'conflict' })
  })
})

describe('assignTask', () => {
  it('lets the creator, an experienced member and an admin assign', async () => {
    task = { id: TASK, status: 'open', assignee_id: null, created_by: ME }
    expect(await assignTask(idle, form({ assigneeId: OTHER }))).toEqual({ status: 'done' })
    expect(updated).toHaveBeenLastCalledWith('tasks', { assignee_id: OTHER })

    task = { id: TASK, status: 'open', assignee_id: null, created_by: OTHER }
    level = 'experienced'
    expect(await assignTask(idle, form({ assigneeId: OTHER }))).toEqual({ status: 'done' })
    level = 'fresh'
    isAdmin = true
    expect(await assignTask(idle, form({ assigneeId: '' }))).toEqual({ status: 'done' })
    expect(updated).toHaveBeenLastCalledWith('tasks', { assignee_id: null })
  })

  it('refuses a fresh member who is neither creator nor assignee, without writing', async () => {
    expect(await assignTask(idle, form({ assigneeId: OTHER }))).toEqual({ status: 'notAllowed' })
    expect(updated).not.toHaveBeenCalled()
  })

  it('refuses a done task for everyone but an admin', async () => {
    task = { id: TASK, status: 'done', assignee_id: ME, created_by: ME }
    expect(await assignTask(idle, form({ assigneeId: OTHER }))).toEqual({ status: 'notAllowed' })
  })

  it('refuses a malformed assignee and maps an assignee outside the group', async () => {
    task = { id: TASK, status: 'open', assignee_id: null, created_by: ME }
    expect(await assignTask(idle, form({ assigneeId: 'nope' }))).toEqual({ status: 'invalid' })
    writeResult = { data: null, error: { code: '23514' } }
    expect(await assignTask(idle, form({ assigneeId: OTHER }))).toEqual({ status: 'invalid' })
  })
})

describe('updateTask', () => {
  it('updates title, description and due date for an editor, never the assignee or status', async () => {
    task = { id: TASK, status: 'open', assignee_id: ME, created_by: OTHER }
    const state = await updateTask(idle, form({ title: 'New title', dueOn: '2026-12-05' }))
    expect(state).toEqual({ status: 'done' })
    expect(updated).toHaveBeenCalledWith('tasks', {
      title: 'New title',
      description: null,
      due_on: '2026-12-05',
    })
  })

  it('refuses a person who may not edit and invalid input', async () => {
    expect(await updateTask(idle, form({ title: 'x' }))).toEqual({ status: 'notAllowed' })
    task = { id: TASK, status: 'open', assignee_id: ME, created_by: OTHER }
    expect(await updateTask(idle, form({ title: '' }))).toEqual({ status: 'invalid' })
    expect(updated).not.toHaveBeenCalled()
  })
})

describe('setTaskStatus', () => {
  it('moves a task between open and in progress for an editor', async () => {
    task = { id: TASK, status: 'open', assignee_id: null, created_by: ME }
    expect(await setTaskStatus(idle, form({ status: 'in_progress' }))).toEqual({ status: 'done' })
    expect(updated).toHaveBeenCalledWith('tasks', { status: 'in_progress' })
    expect(completed).not.toHaveBeenCalled()
  })

  it('completes with a note: only the assignee, and the hook runs once after the write', async () => {
    task = { id: TASK, status: 'in_progress', assignee_id: ME, created_by: OTHER }
    const state = await setTaskStatus(idle, form({ status: 'done', note: 'Sent to the office' }))
    expect(state).toEqual({ status: 'done' })
    expect(updated).toHaveBeenCalledWith('tasks', {
      status: 'done',
      completion_note: 'Sent to the office',
      completion_url: null,
    })
    expect(completed).toHaveBeenCalledTimes(1)
    expect(completed).toHaveBeenCalledWith(TASK)
    expect(order.indexOf('update:tasks')).toBeLessThan(order.indexOf('onTaskCompleted'))
  })

  it('completes with a link only, and lets a new volunteer complete their own task', async () => {
    level = 'new'
    task = { id: TASK, status: 'open', assignee_id: ME, created_by: OTHER }
    expect(
      await setTaskStatus(idle, form({ status: 'done', url: 'https://example.org/result' })),
    ).toEqual({ status: 'done' })
    expect(updated).toHaveBeenCalledWith('tasks', {
      status: 'done',
      completion_note: null,
      completion_url: 'https://example.org/result',
    })
  })

  it('refuses done without a note or a link, and a link that is not https', async () => {
    task = { id: TASK, status: 'open', assignee_id: ME, created_by: OTHER }
    expect(await setTaskStatus(idle, form({ status: 'done' }))).toEqual({
      status: 'needsEvidence',
    })
    expect(await setTaskStatus(idle, form({ status: 'done', url: 'http://example.org' }))).toEqual({
      status: 'invalid',
    })
    expect(updated).not.toHaveBeenCalled()
    expect(completed).not.toHaveBeenCalled()
  })

  it('refuses completion by someone who is not the assignee, even the creator', async () => {
    task = { id: TASK, status: 'open', assignee_id: OTHER, created_by: ME }
    expect(await setTaskStatus(idle, form({ status: 'done', note: 'x' }))).toEqual({
      status: 'notAllowed',
    })
    level = 'experienced'
    expect(await setTaskStatus(idle, form({ status: 'done', note: 'x' }))).toEqual({
      status: 'notAllowed',
    })
    expect(updated).not.toHaveBeenCalled()
    expect(completed).not.toHaveBeenCalled()
  })

  it('lets only an admin reopen a done task', async () => {
    task = { id: TASK, status: 'done', assignee_id: ME, created_by: ME }
    expect(await setTaskStatus(idle, form({ status: 'open' }))).toEqual({ status: 'notAllowed' })
    isAdmin = true
    expect(await setTaskStatus(idle, form({ status: 'open' }))).toEqual({ status: 'done' })
    expect(updated).toHaveBeenCalledWith('tasks', { status: 'open' })
    expect(completed).not.toHaveBeenCalled()
  })

  it('refuses an unknown status and no change, and does not call the hook on a database refusal', async () => {
    task = { id: TASK, status: 'open', assignee_id: ME, created_by: OTHER }
    expect(await setTaskStatus(idle, form({ status: 'finished' }))).toEqual({ status: 'invalid' })
    expect(await setTaskStatus(idle, form({ status: 'open' }))).toEqual({ status: 'conflict' })
    writeResult = { data: null, error: { code: '42501' } }
    expect(await setTaskStatus(idle, form({ status: 'done', note: 'x' }))).toEqual({
      status: 'notAllowed',
    })
    writeResult = { data: null, error: null }
    expect(await setTaskStatus(idle, form({ status: 'done', note: 'x' }))).toEqual({
      status: 'conflict',
    })
    expect(completed).not.toHaveBeenCalled()
  })
})
