// The "latest and planned work" feed of a profile (spec section 7). Pure: no I/O. The database
// function get_profile_work decides which rows the viewer may see; this module only turns them
// into typed items for the page.

export const ACTIVITY_FEED_STATUSES = ['planned', 'active', 'done'] as const
export const TASK_FEED_STATUSES = ['open', 'in_progress', 'done'] as const

export type ActivityFeedStatus = (typeof ACTIVITY_FEED_STATUSES)[number]
export type TaskFeedStatus = (typeof TASK_FEED_STATUSES)[number]

/** One row as get_profile_work returns it. */
export type ProfileWorkRow = {
  kind: string
  id: string
  title: string
  status: string
  due_on: string | null
  group_id: string
  group_name: string
  group_slug: string
  activity_id: string | null
  activity_title: string | null
  updated_at: string
}

type ItemBase = {
  id: string
  title: string
  dueOn: string | null
  groupName: string
  /** The activity page in the group the viewer can see; a task links to its activity. */
  href: string
  /** Planned or active activity, open or in-progress task. */
  isCurrent: boolean
}

export type ProfileWorkItem =
  | (ItemBase & { kind: 'activity'; status: ActivityFeedStatus })
  | (ItemBase & { kind: 'task'; status: TaskFeedStatus; activityTitle: string | null })

const pick = <T extends string>(options: readonly T[], value: string): T | undefined =>
  options.find((option) => option === value)

/**
 * Typed feed items, in the order the database gave them. Rows with an unknown kind or status, or
 * without the activity to link to, are dropped rather than shown half-labelled.
 */
export function toProfileWorkItems(rows: readonly ProfileWorkRow[]): ProfileWorkItem[] {
  return rows.flatMap((row): ProfileWorkItem[] => {
    const activityId = row.kind === 'activity' ? row.id : row.activity_id
    if (!activityId) return []
    const base: ItemBase = {
      id: row.id,
      title: row.title,
      dueOn: row.due_on,
      groupName: row.group_name,
      href: `/groups/${row.group_slug}/activities/${activityId}`,
      isCurrent: false,
    }
    if (row.kind === 'activity') {
      const status = pick(ACTIVITY_FEED_STATUSES, row.status)
      return status ? [{ ...base, kind: 'activity', status, isCurrent: status !== 'done' }] : []
    }
    if (row.kind === 'task') {
      const status = pick(TASK_FEED_STATUSES, row.status)
      return status
        ? [
            {
              ...base,
              kind: 'task',
              status,
              activityTitle: row.activity_title,
              isCurrent: status !== 'done',
            },
          ]
        : []
    }
    return []
  })
}
