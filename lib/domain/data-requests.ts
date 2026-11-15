// Data requests (P-03, spec section 9 "Rights"): a member asks an admin to export or delete their
// data. Pure: no I/O.
import { z } from 'zod'

export const DATA_REQUEST_KINDS = ['export', 'deletion'] as const
export type DataRequestKind = (typeof DATA_REQUEST_KINDS)[number]

export const DATA_REQUEST_STATUSES = ['open', 'done'] as const
export type DataRequestStatus = (typeof DATA_REQUEST_STATUSES)[number]

const kindSchema = z.enum(DATA_REQUEST_KINDS)

/** The kind from a form value, or null if it is not one of the two. */
export function parseDataRequestKind(value: unknown): DataRequestKind | null {
  const parsed = kindSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** An id from a form or an action argument, or null if it is not a UUID. */
export function parseRequestId(value: unknown): string | null {
  const parsed = z.uuid().safeParse(value)
  return parsed.success ? parsed.data : null
}

/** Open requests first, then the newest first within each group. */
export function sortRequests<T extends { status: DataRequestStatus; created_at: string }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1
    return b.created_at.localeCompare(a.created_at)
  })
}
