// Shape of an activity type definition (ADR-0020, refining ADR-0003). Pure: no I/O.
import type { z } from 'zod'

export type FieldInput = 'text' | 'textarea' | 'url' | 'datetime' | 'date' | 'select' | 'list'

/** One field of a type's `details`, in the order a form renders it. */
export type FieldDefinition = {
  /** Key inside `activities.details`. */
  name: string
  /** i18n key under `activityTypes`. */
  labelKey: string
  input: FieldInput
  required: boolean
  /** Values of a `select`, or the kinds of a material list. */
  options?: readonly string[]
  /** Character cap of a text, textarea or url field, or of each item of a text list. */
  maxLength?: number
  /** What a `list` holds: free-text names, or materials (`{ kind, url | text }`). */
  itemKind?: 'text' | 'material'
}

export type ActivityTypeDefinition = {
  /** The value stored in `activities.type`. */
  key: string
  /** i18n keys under `activityTypes`. */
  labelKey: string
  descriptionKey: string
  /** False for types the database creates itself (General). */
  selectable: boolean
  /** One Zod schema per `details` key; `detailsSchema` is the strict object built from it. */
  shape: Record<string, z.ZodType>
  detailsSchema: z.ZodType<Record<string, unknown>>
  fields: readonly FieldDefinition[]
  /** A short one-line summary for lists, from details that passed `detailsSchema`. */
  summarize: (details: Record<string, unknown>) => string
}
