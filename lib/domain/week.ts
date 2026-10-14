/**
 * Start of the ISO week (Monday 00:00 UTC) that contains the given instant.
 * Working group leads rotate weekly, and a lead assignment is keyed by this date.
 */
export function startOfIsoWeek(date: Date): Date {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const daysSinceMonday = (start.getUTCDay() + 6) % 7
  start.setUTCDate(start.getUTCDate() - daysSinceMonday)
  return start
}
