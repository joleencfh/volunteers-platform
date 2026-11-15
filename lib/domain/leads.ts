// Lead of the week (spec section 5). Pure: no I/O. A lead is a responsibility, not a permission.
// The week rule also lives in SQL (the wg_leads policies in 20261115150206_working_groups.sql).
import { z } from 'zod'
import { startOfIsoWeek } from './week'

/** The four things the lead of the week does, in spec order. Message keys: `groups.lead.checklist.<key>`. */
export const LEAD_CHECKLIST = ['moderate', 'agenda', 'nextCall', 'tasks'] as const
export type LeadChecklistKey = (typeof LEAD_CHECKLIST)[number]

/** How many weeks the overview lists (the current one and the previous ones) and can assign ahead. */
export const LEAD_HISTORY_WEEKS = 12
export const LEAD_WEEKS_AHEAD = 4

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** `YYYY-MM-DD` of a UTC date, the way `wg_leads.week_start` is keyed. */
export function formatWeekStart(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Monday 00:00 UTC of the week containing `now`, as `YYYY-MM-DD`. */
export function currentWeekStart(now: Date): string {
  return formatWeekStart(startOfIsoWeek(now))
}

function parseWeek(weekStart: string): Date | null {
  if (!WEEK_PATTERN.test(weekStart)) return null
  const date = new Date(`${weekStart}T00:00:00Z`)
  // Rejects impossible dates such as 2026-02-30, which Date would roll over.
  return Number.isNaN(date.getTime()) || formatWeekStart(date) !== weekStart ? null : date
}

/** A week can be assigned when it starts on a Monday and is the current week or a later one. */
export function isAssignableWeek(weekStart: string, now: Date): boolean {
  const date = parseWeek(weekStart)
  if (!date || date.getUTCDay() !== 1) return false
  return date.getTime() >= startOfIsoWeek(now).getTime()
}

/** The Mondays an assigner may pick: the current week and the next `LEAD_WEEKS_AHEAD`. */
export function assignableWeeks(now: Date): string[] {
  const first = startOfIsoWeek(now).getTime()
  return Array.from({ length: LEAD_WEEKS_AHEAD + 1 }, (_, index) =>
    formatWeekStart(new Date(first + index * 7 * DAY_MS)),
  )
}

/** The Mondays shown in the history list: the current week first, then back `LEAD_HISTORY_WEEKS - 1`. */
export function historyWeeks(now: Date): string[] {
  const first = startOfIsoWeek(now).getTime()
  return Array.from({ length: LEAD_HISTORY_WEEKS }, (_, index) =>
    formatWeekStart(new Date(first - index * 7 * DAY_MS)),
  )
}

/** Input of the assign action. Whether the week is assignable depends on the clock: see `isAssignableWeek`. */
export const assignLeadSchema = z.object({
  groupId: z.uuid(),
  userId: z.uuid(),
  weekStart: z.string().refine((value) => parseWeek(value) !== null),
})
