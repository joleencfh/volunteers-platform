import { describe, expect, it } from 'vitest'
import { canCreateInGroup, type TaskStatus } from '@/lib/domain/activities'
import type { UserLevel } from '@/lib/domain/review'
import {
  assigneeFilterValue,
  canAssignTask,
  canComplete,
  canCreateTask,
  canEditTask,
  canEditTaskFields,
  canReopen,
  canTake,
  compareByDue,
  completionSchema,
  nextStatuses,
  parseTaskFilters,
  taskInputSchema,
  type TaskActor,
} from '@/lib/domain/tasks'

const LEVELS: UserLevel[] = ['new', 'fresh', 'experienced']
const STATUSES: TaskStatus[] = ['open', 'in_progress', 'done']
const USER = '8b1c2f3e-4d5a-4b6c-8d7e-9f0a1b2c3d4e'

const actor = (overrides: Partial<TaskActor> = {}): TaskActor => ({
  level: 'fresh',
  isAdmin: false,
  isMember: true,
  isCreator: false,
  isAssignee: false,
  ...overrides,
})

describe('canCreateTask', () => {
  it('is the activity creation rule: fresh and experienced members, and admins', () => {
    for (const level of LEVELS) {
      for (const isAdmin of [false, true]) {
        for (const isMember of [false, true]) {
          const who = { level, isAdmin, isMember }
          expect(canCreateTask(who)).toBe(canCreateInGroup(who))
        }
      }
    }
  })

  it('allows a fresh member, refuses a new volunteer and a non-member', () => {
    expect(canCreateTask(actor())).toBe(true)
    expect(canCreateTask(actor({ level: 'new' }))).toBe(false)
    expect(canCreateTask(actor({ isMember: false }))).toBe(false)
    expect(canCreateTask(actor({ isAdmin: true, isMember: false }))).toBe(true)
  })
})

describe('canTake', () => {
  it('lets any member take an unassigned task that is not done, new volunteers too', () => {
    for (const level of LEVELS) {
      expect(canTake(actor({ level }), { status: 'open', assigneeId: null })).toBe(true)
      expect(canTake(actor({ level }), { status: 'in_progress', assigneeId: null })).toBe(true)
    }
  })

  it('refuses an assigned task, a done task and a non-member', () => {
    expect(canTake(actor(), { status: 'open', assigneeId: USER })).toBe(false)
    expect(canTake(actor(), { status: 'done', assigneeId: null })).toBe(false)
    expect(canTake(actor({ isMember: false }), { status: 'open', assigneeId: null })).toBe(false)
  })
})

describe('who may edit, assign, complete and reopen (actor x task state)', () => {
  const open = { status: 'open' as const, assigneeId: USER }
  const done = { status: 'done' as const, assigneeId: USER }

  it('editors are the creator, the assignee, experienced members and admins', () => {
    expect(canEditTask(actor())).toBe(false)
    expect(canEditTask(actor({ isCreator: true }))).toBe(true)
    expect(canEditTask(actor({ isAssignee: true }))).toBe(true)
    expect(canEditTask(actor({ level: 'experienced' }))).toBe(true)
    expect(canEditTask(actor({ isAdmin: true, isMember: false }))).toBe(true)
    // A creator who left the group no longer edits.
    expect(canEditTask(actor({ isCreator: true, isMember: false }))).toBe(false)
    // A new volunteer who created or was given a task still edits it (they are the assignee).
    expect(canEditTask(actor({ level: 'new', isAssignee: true }))).toBe(true)
  })

  it('editing the fields follows editing, but only an admin edits a done task', () => {
    expect(canEditTaskFields(actor({ isCreator: true }), open)).toBe(true)
    expect(canEditTaskFields(actor({ isAssignee: true }), done)).toBe(false)
    expect(canEditTaskFields(actor(), open)).toBe(false)
    expect(canEditTaskFields(actor({ isAdmin: true }), done)).toBe(true)
  })

  it('assigning follows editing, but only an admin changes a done task', () => {
    expect(canAssignTask(actor({ isCreator: true }), open)).toBe(true)
    expect(canAssignTask(actor({ isCreator: true }), done)).toBe(false)
    expect(canAssignTask(actor(), open)).toBe(false)
    expect(canAssignTask(actor({ isAdmin: true }), done)).toBe(true)
  })

  it('only the assignee or an admin completes, and only a task with an assignee', () => {
    expect(canComplete(actor({ isAssignee: true }), open)).toBe(true)
    expect(canComplete(actor({ level: 'new', isAssignee: true }), open)).toBe(true)
    expect(canComplete(actor({ isCreator: true }), open)).toBe(false)
    expect(canComplete(actor({ level: 'experienced' }), open)).toBe(false)
    expect(canComplete(actor({ isAdmin: true }), open)).toBe(true)
    expect(canComplete(actor({ isAssignee: true }), done)).toBe(false)
    expect(canComplete(actor({ isAdmin: true }), { status: 'open', assigneeId: null })).toBe(false)
  })

  it('only an admin reopens a done task', () => {
    expect(canReopen(actor({ isAdmin: true }), done)).toBe(true)
    expect(canReopen(actor({ isAdmin: true }), open)).toBe(false)
    for (const level of LEVELS) {
      expect(canReopen(actor({ level, isAssignee: true, isCreator: true }), done)).toBe(false)
    }
  })
})

describe('nextStatuses', () => {
  it('offers the other open state to editors and done to the assignee', () => {
    const task = { status: 'open' as const, assigneeId: USER }
    expect(nextStatuses(actor({ isAssignee: true }), task)).toEqual(['in_progress', 'done'])
    expect(nextStatuses(actor({ isCreator: true }), task)).toEqual(['in_progress'])
    expect(nextStatuses(actor(), task)).toEqual([])
    expect(nextStatuses(actor({ isAssignee: true }), { ...task, status: 'in_progress' })).toEqual([
      'open',
      'done',
    ])
  })

  it('offers nothing for a done task except to an admin, who reopens it', () => {
    const task = { status: 'done' as const, assigneeId: USER }
    expect(nextStatuses(actor({ isAssignee: true, isCreator: true }), task)).toEqual([])
    expect(nextStatuses(actor({ isAdmin: true }), task)).toEqual(['open', 'in_progress'])
  })

  it('never offers the current status, and done only with an assignee', () => {
    for (const status of STATUSES) {
      const next = nextStatuses(actor({ isAdmin: true }), { status, assigneeId: null })
      expect(next).not.toContain(status)
      expect(next).not.toContain('done')
    }
  })
})

describe('taskInputSchema', () => {
  it('accepts a title alone and trims it', () => {
    const parsed = taskInputSchema.parse({ title: '  Write the letter  ' })
    expect(parsed).toEqual({ title: 'Write the letter', assigneeId: null })
  })

  it('reads blank optional fields as missing and keeps a valid assignee and date', () => {
    const parsed = taskInputSchema.parse({
      title: 'Task',
      description: '  ',
      dueOn: '2026-12-01',
      assigneeId: USER,
    })
    expect(parsed).toEqual({ title: 'Task', dueOn: '2026-12-01', assigneeId: USER })
    expect(
      taskInputSchema.parse({ title: 'Task', assigneeId: '', dueOn: '' }).assigneeId,
    ).toBeNull()
  })

  it('refuses a blank or long title, a bad date and a bad assignee', () => {
    expect(taskInputSchema.safeParse({ title: '   ' }).success).toBe(false)
    expect(taskInputSchema.safeParse({ title: 'x'.repeat(121) }).success).toBe(false)
    expect(taskInputSchema.safeParse({ title: 'Task', dueOn: '2026-13-40' }).success).toBe(false)
    expect(taskInputSchema.safeParse({ title: 'Task', assigneeId: 'nope' }).success).toBe(false)
    expect(
      taskInputSchema.safeParse({ title: 'Task', description: 'x'.repeat(2001) }).success,
    ).toBe(false)
  })
})

describe('completionSchema', () => {
  it('needs a note or a link: note only, link only and both pass, neither fails', () => {
    expect(completionSchema.safeParse({ note: 'Sent it' }).success).toBe(true)
    expect(completionSchema.safeParse({ url: 'https://example.org/report' }).success).toBe(true)
    expect(completionSchema.safeParse({ note: 'Sent', url: 'https://example.org' }).success).toBe(
      true,
    )
    expect(completionSchema.safeParse({}).success).toBe(false)
    expect(completionSchema.safeParse({ note: '   ', url: '' }).success).toBe(false)
  })

  it('refuses a link that is not https and a note over the limit', () => {
    expect(completionSchema.safeParse({ url: 'http://example.org' }).success).toBe(false)
    expect(completionSchema.safeParse({ url: 'javascript:alert(1)' }).success).toBe(false)
    expect(completionSchema.safeParse({ note: 'x'.repeat(2001) }).success).toBe(false)
  })
})

describe('parseTaskFilters', () => {
  it('reads known statuses and assignees', () => {
    expect(parseTaskFilters({ status: 'done', assignee: 'me' })).toEqual({
      status: 'done',
      assignee: 'me',
    })
    expect(parseTaskFilters({ assignee: 'unassigned' }).assignee).toBe('unassigned')
    expect(parseTaskFilters({ assignee: USER.toUpperCase() }).assignee).toEqual({ userId: USER })
  })

  it('ignores anything unknown or repeated', () => {
    expect(parseTaskFilters({ status: 'planned', assignee: "x' or 1=1" })).toEqual({
      status: null,
      assignee: null,
    })
    expect(parseTaskFilters({ status: ['open', 'done'] }).status).toBe('open')
    expect(parseTaskFilters({})).toEqual({ status: null, assignee: null })
  })

  it('turns a filter back into its form value', () => {
    expect(assigneeFilterValue(null)).toBe('')
    expect(assigneeFilterValue('me')).toBe('me')
    expect(assigneeFilterValue({ userId: USER })).toBe(USER)
  })
})

describe('compareByDue', () => {
  const task = (due_on: string | null, created_at: string) => ({ due_on, created_at })
  it('puts the soonest due first and undated tasks last, then the oldest first', () => {
    const sorted = [
      task(null, '2026-01-01'),
      task('2026-12-05', '2026-01-02'),
      task('2026-12-01', '2026-01-03'),
      task(null, '2025-01-01'),
    ].sort(compareByDue)
    expect(sorted.map((row) => [row.due_on, row.created_at])).toEqual([
      ['2026-12-01', '2026-01-03'],
      ['2026-12-05', '2026-01-02'],
      [null, '2025-01-01'],
      [null, '2026-01-01'],
    ])
  })
})
