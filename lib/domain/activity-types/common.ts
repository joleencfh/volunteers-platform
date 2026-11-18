// Building blocks shared by the activity types. Pure: no I/O.
import { z } from 'zod'
import { isValidLinkUrl, localDateTimeToUtc } from '../meetings'

export const TEXT_MAX_LENGTH = 2000
export const SHORT_TEXT_MAX_LENGTH = 200
export const LIST_MAX_ITEMS = 50
export const SUMMARY_MAX_LENGTH = 80

export const text = (max: number = TEXT_MAX_LENGTH) => z.string().trim().min(1).max(max)

/** An https-only link (the same rule as meetings and group links). */
export const httpsUrl = z.string().trim().refine(isValidLinkUrl)

/** `YYYY-MM-DD` that is a real calendar day. */
export const dateOnly = z.iso.date()

/** An instant, as stored (`toISOString()` output). Forms send local time: convert with `localToInstant`. */
export const instant = z.iso.datetime()

export const textList = (max: number = SHORT_TEXT_MAX_LENGTH) =>
  z.array(text(max)).min(1).max(LIST_MAX_ITEMS)

/** Turns a form's local date-time (app time zone) into the stored instant; null if invalid. */
export function localToInstant(local: string): string | null {
  return localDateTimeToUtc(local)?.toISOString() ?? null
}

/** The first `SUMMARY_MAX_LENGTH` characters of a text, with an ellipsis when cut. */
export function clip(value: string): string {
  return value.length > SUMMARY_MAX_LENGTH ? `${value.slice(0, SUMMARY_MAX_LENGTH - 1)}…` : value
}

export const asString = (value: unknown): string => (typeof value === 'string' ? value : '')

export function asStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

export function hostOf(url: unknown): string {
  try {
    return new URL(asString(url)).hostname
  } catch {
    return ''
  }
}
