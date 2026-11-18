// Reading and validating what the activity forms send, and the list filters (T-03). Pure: no I/O.
// The type-specific part is checked with the registry's `detailsSchema` (ADR-0020); the common part
// below mirrors the column limits in lib/domain/activities.ts and the activities table checks.
import { z } from 'zod'
import {
  ACTIVITY_DESCRIPTION_MAX_LENGTH,
  ACTIVITY_LINKS_MAX,
  ACTIVITY_STATUSES,
  ACTIVITY_TITLE_MAX_LENGTH,
  type ActivityStatus,
} from './activities'
import { MATERIAL_KINDS } from './activity-types/call-with-target'
import { httpsUrl } from './activity-types/common'
import { isActivityTypeKey, localToInstant, type FieldDefinition } from './activity-types'
import { toLocalDateTime } from './meetings'

export const LINK_LABEL_MAX_LENGTH = 80
/** How many material rows the call form offers (the schema allows more; the form keeps it simple). */
export const MATERIAL_ROWS = 5
/** How many link rows the activity form offers. */
export const LINK_ROWS = 5

/** What a form submits: only `get` is needed, so tests can pass a plain map. */
export type FormSource = { get(name: string): FormDataEntryValue | null }

function read(source: FormSource, name: string): string {
  const value = source.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

const blankToUndefined = (value: string) => (value === '' ? undefined : value)

const optionalDate = z.iso.date().optional()

const linkSchema = z.strictObject({
  label: z.string().trim().min(1).max(LINK_LABEL_MAX_LENGTH),
  url: httpsUrl,
})

export const activityCommonSchema = z
  .object({
    title: z.string().trim().min(1).max(ACTIVITY_TITLE_MAX_LENGTH),
    description: z.string().trim().max(ACTIVITY_DESCRIPTION_MAX_LENGTH).optional(),
    status: z.enum(ACTIVITY_STATUSES),
    startsOn: optionalDate,
    dueOn: optionalDate,
    keyActivity: z.boolean(),
    links: z.array(linkSchema).max(ACTIVITY_LINKS_MAX),
  })
  .refine((value) => !value.startsOn || !value.dueOn || value.dueOn >= value.startsOn, {
    path: ['dueOn'],
  })

export type ActivityCommon = z.infer<typeof activityCommonSchema>

/** Reads and validates the common fields (title, description, status, dates, key flag, links). */
export function parseActivityCommon(
  source: FormSource,
): { ok: true; data: ActivityCommon } | { ok: false } {
  const links: { label: string; url: string }[] = []
  for (let index = 0; index < LINK_ROWS; index++) {
    const label = read(source, `links.label.${index}`)
    const url = read(source, `links.url.${index}`)
    if (label === '' && url === '') continue
    links.push({ label, url })
  }
  const parsed = activityCommonSchema.safeParse({
    title: read(source, 'title'),
    description: blankToUndefined(read(source, 'description')),
    status: read(source, 'status') || 'planned',
    startsOn: blankToUndefined(read(source, 'startsOn')),
    dueOn: blankToUndefined(read(source, 'dueOn')),
    keyActivity: read(source, 'keyActivity') === 'on',
    links,
  })
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false }
}

function readMaterials(source: FormSource, name: string) {
  const items: { kind: string; url?: string; text?: string }[] = []
  for (let index = 0; index < MATERIAL_ROWS; index++) {
    const value = read(source, `details.${name}.value.${index}`)
    if (value === '') continue
    const kind = read(source, `details.${name}.kind.${index}`) || 'other'
    items.push(value.startsWith('https://') ? { kind, url: value } : { kind, text: value })
  }
  return items
}

/**
 * Turns the details fields of a form into the object the type's `detailsSchema` checks. Blank fields
 * are left out, a list is one item per line, a date-time is converted from the app time zone to an
 * instant. A value that cannot be converted stays as typed, so the schema refuses it.
 */
export function readDetails(
  fields: readonly FieldDefinition[],
  source: FormSource,
): Record<string, unknown> {
  const details: Record<string, unknown> = {}
  for (const field of fields) {
    if (field.input === 'list' && field.itemKind === 'material') {
      const items = readMaterials(source, field.name)
      if (items.length > 0) details[field.name] = items
      continue
    }
    const raw = read(source, `details.${field.name}`)
    if (raw === '') continue
    if (field.input === 'list') {
      const lines = raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line !== '')
      if (lines.length > 0) details[field.name] = lines
    } else if (field.input === 'datetime') {
      details[field.name] = localToInstant(raw) ?? raw
    } else {
      details[field.name] = raw
    }
  }
  return details
}

/** The kinds a material row may have (for the select). */
export const MATERIAL_KIND_OPTIONS = MATERIAL_KINDS

export type ActivityFilters = { status: ActivityStatus | null; type: string | null }

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

/** The `?status=` and `?type=` of the Activities tab; anything unknown or repeated is ignored. */
export function parseActivityFilters(params: {
  status?: string | string[]
  type?: string | string[]
}): ActivityFilters {
  const status = first(params.status)
  const type = first(params.type)
  return {
    status: ACTIVITY_STATUSES.find((candidate) => candidate === status) ?? null,
    type: isActivityTypeKey(type) ? type : null,
  }
}

/** The `?type=` of the create page, only when it is a type the form offers. */
export function parseSelectableType(
  value: string | string[] | undefined,
  selectable: readonly { key: string }[],
): string | null {
  const type = first(value)
  return selectable.find((candidate) => candidate.key === type)?.key ?? null
}

/** What an edit form starts with: plain strings per `details.<name>` field, and material rows. */
export type DetailDefaults = {
  values: Record<string, string>
  materials: Record<string, { kind: string; value: string }[]>
}

/**
 * The inverse of `readDetails`: turns a stored (loosely parsed) `details` object into the values an
 * edit form shows. A list becomes one item per line, an instant becomes the local date-time of the
 * app time zone, a material becomes a kind and its link or text. Anything of the wrong shape is
 * skipped, so an old row never breaks the form.
 */
export function toDetailDefaults(
  fields: readonly FieldDefinition[],
  details: Record<string, unknown>,
): DetailDefaults {
  const values: Record<string, string> = {}
  const materials: DetailDefaults['materials'] = {}
  for (const field of fields) {
    const value = details[field.name]
    if (value === undefined || value === null) continue
    if (field.input === 'list' && field.itemKind === 'material') {
      if (!Array.isArray(value)) continue
      materials[field.name] = value.slice(0, MATERIAL_ROWS).flatMap((item) => {
        if (typeof item !== 'object' || item === null) return []
        const { kind, url, text } = item as { kind?: unknown; url?: unknown; text?: unknown }
        const shown = typeof url === 'string' ? url : typeof text === 'string' ? text : ''
        return shown === ''
          ? []
          : [{ kind: typeof kind === 'string' ? kind : 'other', value: shown }]
      })
    } else if (field.input === 'list') {
      if (Array.isArray(value)) {
        values[field.name] = value.filter((item) => typeof item === 'string').join('\n')
      }
    } else if (typeof value === 'string') {
      if (field.input === 'datetime') {
        const when = new Date(value)
        if (!Number.isNaN(when.getTime())) values[field.name] = toLocalDateTime(when)
      } else {
        values[field.name] = value
      }
    }
  }
  return { values, materials }
}
