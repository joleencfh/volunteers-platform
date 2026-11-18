import { describe, expect, it } from 'vitest'
import { type ProfileWorkRow, toProfileWorkItems } from '@/lib/domain/profile-work'

function row(over: Partial<ProfileWorkRow> = {}): ProfileWorkRow {
  return {
    kind: 'activity',
    id: 'act-1',
    title: 'Synthetic activity',
    status: 'active',
    due_on: null,
    group_id: 'g-1',
    group_name: 'Synthetic group',
    group_slug: 'synthetic',
    activity_id: 'act-1',
    activity_title: null,
    updated_at: '2026-11-01T10:00:00Z',
    ...over,
  }
}

describe('toProfileWorkItems', () => {
  it('links an activity to its own page in its group', () => {
    const [item] = toProfileWorkItems([row()])
    expect(item).toMatchObject({
      kind: 'activity',
      status: 'active',
      href: '/groups/synthetic/activities/act-1',
      groupName: 'Synthetic group',
      isCurrent: true,
    })
  })

  it('links a task to the page of its activity and keeps the activity title', () => {
    const [item] = toProfileWorkItems([
      row({
        kind: 'task',
        id: 'task-1',
        status: 'in_progress',
        activity_id: 'act-9',
        activity_title: 'Parent',
        due_on: '2026-12-01',
      }),
    ])
    expect(item).toMatchObject({
      kind: 'task',
      id: 'task-1',
      href: '/groups/synthetic/activities/act-9',
      activityTitle: 'Parent',
      dueOn: '2026-12-01',
      isCurrent: true,
    })
  })

  it('marks done items as not current', () => {
    const items = toProfileWorkItems([
      row({ status: 'done' }),
      row({ kind: 'task', id: 't', status: 'done', activity_id: 'a' }),
    ])
    expect(items.map((item) => item.isCurrent)).toEqual([false, false])
  })

  it('keeps the order the database gave', () => {
    const items = toProfileWorkItems([
      row({ id: 'b', activity_id: 'b' }),
      row({ kind: 'task', id: 'a', status: 'open', activity_id: 'x' }),
      row({ id: 'c', activity_id: 'c', status: 'planned' }),
    ])
    expect(items.map((item) => item.id)).toEqual(['b', 'a', 'c'])
  })

  it('drops rows with an unknown kind or status, or without an activity to link to', () => {
    const items = toProfileWorkItems([
      row({ kind: 'comment' }),
      row({ status: 'cancelled' }),
      row({ kind: 'task', status: 'planned', activity_id: 'a' }),
      row({ kind: 'task', status: 'open', activity_id: null }),
      row({ kind: 'activity', status: 'open' }),
    ])
    expect(items).toEqual([])
  })

  it('returns nothing for no rows', () => {
    expect(toProfileWorkItems([])).toEqual([])
  })
})
