// What "My work" on /home and the onboarding "current activities" window list (spec sections 5
// and 8). Pure: no I/O. The pages read the rows with the member's own session and pass them in.
import { compareByDue } from './tasks'

/** Tasks shown on /home; the rest are one click away on My tasks. */
export const HOME_TASKS_LIMIT = 5
/** Activities shown on /home. */
export const HOME_ACTIVITIES_LIMIT = 5
/** Activities listed in the onboarding window of step 4. */
export const CURRENT_ACTIVITIES_LIMIT = 10

const CURRENT_STATUSES: readonly string[] = ['planned', 'active']
const OPEN_TASK_STATUSES: readonly string[] = ['open', 'in_progress']

export type WorkTaskRow = {
  id: string
  title: string
  status: string
  due_on: string | null
  created_at: string
  activity_id: string
  group_id: string
}

export type WorkActivityRow = {
  id: string
  title: string
  status: string
  group_id: string
  is_general?: boolean
  archived_at?: string | null
}

const isCurrent = (row: { status: string; archived_at?: string | null }) =>
  CURRENT_STATUSES.includes(row.status) && !row.archived_at

/** Open and in-progress tasks, soonest due first, at most `limit`. */
export function selectOpenTasks<T extends WorkTaskRow>(
  rows: readonly T[],
  limit: number = HOME_TASKS_LIMIT,
): T[] {
  return rows
    .filter((row) => OPEN_TASK_STATUSES.includes(row.status))
    .toSorted(compareByDue)
    .slice(0, limit)
}

/** Active activities before planned ones, then by title; archived ones never appear. */
function compareCurrent(
  a: { status: string; title: string },
  b: { status: string; title: string },
) {
  if (a.status !== b.status) return a.status === 'active' ? -1 : 1
  return a.title.localeCompare(b.title)
}

/** Planned and active, non-archived activities (General included) a member takes part in. */
export function selectMyActivities<T extends WorkActivityRow>(
  rows: readonly T[],
  limit: number = HOME_ACTIVITIES_LIMIT,
): T[] {
  return rows.filter(isCurrent).toSorted(compareCurrent).slice(0, limit)
}

/** Planned and active, non-archived, non-General activities for the step 4 window. */
export function selectCurrentActivities<T extends WorkActivityRow>(
  rows: readonly T[],
  limit: number = CURRENT_ACTIVITIES_LIMIT,
): T[] {
  return rows
    .filter((row) => isCurrent(row) && !row.is_general)
    .toSorted(compareCurrent)
    .slice(0, limit)
}
