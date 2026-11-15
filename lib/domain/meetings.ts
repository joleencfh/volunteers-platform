// Meetings and group links (spec section 5: "links only"). Pure: no I/O. The https-only rule also
// lives in SQL (the check constraints in 20261115150206_working_groups.sql).
import { z } from 'zod'
import { TIME_ZONE } from '@/lib/i18n/config'

export const MAX_URL_LENGTH = 500
/** How many past meetings the Meetings section lists. */
export const PAST_MEETINGS_SHOWN = 10
/** How many upcoming meetings the Overview lists. */
export const OVERVIEW_MEETINGS_SHOWN = 3

const DAY_MS = 24 * 60 * 60 * 1000
const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

/** `https://` only, no whitespace, a host, and at most `MAX_URL_LENGTH` characters. */
export function isValidLinkUrl(value: string): boolean {
  if (value.length > MAX_URL_LENGTH || !/^https:\/\/\S+$/.test(value)) return false
  try {
    return new URL(value).hostname !== ''
  } catch {
    return false
  }
}

/** The zone's offset from UTC, in milliseconds, at the given instant (positive east of UTC). */
function zoneOffset(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(instant))
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  )
  return asUtc - Math.floor(instant / 1000) * 1000
}

/** `YYYY-MM-DDTHH:mm` of an instant on the wall clock of `timeZone`: the value of a datetime-local input. */
export function toLocalDateTime(instant: Date, timeZone: string = TIME_ZONE): string {
  return new Date(instant.getTime() + zoneOffset(instant.getTime(), timeZone))
    .toISOString()
    .slice(0, 16)
}

/**
 * The UTC instant for a wall-clock `YYYY-MM-DDTHH:mm` in `timeZone` (the app's by default). Null for
 * text that is not a date-time and for a time that does not exist because the clocks jumped over it.
 * A time that happens twice when the clocks go back resolves to the first one.
 */
export function localDateTimeToUtc(local: string, timeZone: string = TIME_ZONE): Date | null {
  const match = LOCAL_DATE_TIME.exec(local)
  if (!match) return null
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ]
  const wallClock = Date.UTC(year, month - 1, day, hour, minute)
  // Try the offset a day before and a day after: across a clock change they differ, and the one
  // that round-trips back to the same wall clock gives the instant.
  const candidates = [
    wallClock - zoneOffset(wallClock - DAY_MS, timeZone),
    wallClock - zoneOffset(wallClock + DAY_MS, timeZone),
  ].sort((a, b) => a - b)
  for (const candidate of candidates) {
    const instant = new Date(candidate)
    if (toLocalDateTime(instant, timeZone) === local) return instant
  }
  return null
}

/** A form field that may be left empty: blank means no value. */
const optionalUrl = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .refine((value) => value === null || isValidLinkUrl(value))

const meetingFields = z.object({
  groupId: z.uuid(),
  startsAt: z.string().refine((value) => localDateTimeToUtc(value) !== null),
  meetingUrl: z.string().trim().refine(isValidLinkUrl),
  agendaUrl: optionalUrl,
})

/** Input of `addMeeting`: `startsAt` is the local date-time in the app time zone; the output holds the UTC instant. */
export const meetingSchema = meetingFields.transform((input) => ({
  ...input,
  // Checked by the refinement above.
  startsAt: (localDateTimeToUtc(input.startsAt) as Date).toISOString(),
}))

export const updateMeetingSchema = meetingFields
  .extend({ meetingId: z.uuid() })
  .transform((input) => ({
    ...input,
    startsAt: (localDateTimeToUtc(input.startsAt) as Date).toISOString(),
  }))

export const meetingTargetSchema = z.object({ groupId: z.uuid(), meetingId: z.uuid() })

export const groupLinksSchema = z.object({
  groupId: z.uuid(),
  signalUrl: optionalUrl,
  docsUrl: optionalUrl,
})
