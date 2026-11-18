import { describe, expect, it } from 'vitest'
import {
  CURRENT_ACTIVITIES_LIMIT,
  HOME_ACTIVITIES_LIMIT,
  HOME_TASKS_LIMIT,
  selectCurrentActivities,
  selectMyActivities,
  selectOpenTasks,
  type WorkActivityRow,
  type WorkTaskRow,
} from '@/lib/domain/my-work'

function task(id: string, over: Partial<WorkTaskRow> = {}): WorkTaskRow {
  return {
    id,
    title: id,
    status: 'open',
    due_on: null,
    created_at: '2026-11-01T10:00:00Z',
    activity_id: 'a',
    group_id: 'g',
    ...over,
  }
}

function activity(id: string, over: Partial<WorkActivityRow> = {}): WorkActivityRow {
  return { id, title: id, status: 'active', group_id: 'g', is_general: false, ...over }
}

describe('selectOpenTasks', () => {
  it('keeps open and in-progress tasks only, soonest due first, undated last', () => {
    const rows = [
      task('undated'),
      task('later', { due_on: '2026-12-01', status: 'in_progress' }),
      task('done', { status: 'done', due_on: '2026-11-01' }),
      task('soon', { due_on: '2026-11-20' }),
    ]
    expect(selectOpenTasks(rows).map((row) => row.id)).toEqual(['soon', 'later', 'undated'])
  })

  it('caps the list', () => {
    const rows = Array.from({ length: 9 }, (_, i) => task(`t${i}`, { due_on: `2026-12-0${i + 1}` }))
    expect(selectOpenTasks(rows)).toHaveLength(HOME_TASKS_LIMIT)
    expect(selectOpenTasks(rows, 2).map((row) => row.id)).toEqual(['t0', 't1'])
  })

  it('does not change its input', () => {
    const rows = [task('b', { due_on: '2026-12-02' }), task('a', { due_on: '2026-12-01' })]
    selectOpenTasks(rows)
    expect(rows.map((row) => row.id)).toEqual(['b', 'a'])
  })
})

describe('selectMyActivities', () => {
  it('lists planned and active activities, active first then by title, never archived ones', () => {
    const rows = [
      activity('b-planned', { status: 'planned' }),
      activity('done', { status: 'done' }),
      activity('cancelled', { status: 'cancelled' }),
      activity('archived', { archived_at: '2026-11-01T00:00:00Z' }),
      activity('z-active'),
      activity('a-active'),
    ]
    expect(selectMyActivities(rows).map((row) => row.id)).toEqual([
      'a-active',
      'z-active',
      'b-planned',
    ])
  })

  it('keeps the General activity the member takes part in and caps the list', () => {
    expect(selectMyActivities([activity('general', { is_general: true })])).toHaveLength(1)
    const many = Array.from({ length: 8 }, (_, i) => activity(`a${i}`))
    expect(selectMyActivities(many)).toHaveLength(HOME_ACTIVITIES_LIMIT)
  })
})

describe('selectCurrentActivities', () => {
  it('leaves out General, archived, done and cancelled activities', () => {
    const rows = [
      activity('general', { is_general: true }),
      activity('archived', { archived_at: '2026-11-01T00:00:00Z' }),
      activity('done', { status: 'done' }),
      activity('cancelled', { status: 'cancelled' }),
      activity('planned', { status: 'planned' }),
      activity('active'),
    ]
    expect(selectCurrentActivities(rows).map((row) => row.id)).toEqual(['active', 'planned'])
  })

  it('caps the list at ten and returns an empty list for no rows', () => {
    const many = Array.from({ length: 14 }, (_, i) => activity(`a${String(i).padStart(2, '0')}`))
    expect(selectCurrentActivities(many)).toHaveLength(CURRENT_ACTIVITIES_LIMIT)
    expect(selectCurrentActivities([])).toEqual([])
  })
})
