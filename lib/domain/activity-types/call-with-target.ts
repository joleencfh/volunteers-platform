import { z } from 'zod'
import type { ActivityTypeDefinition } from './types'
import {
  asStrings,
  clip,
  httpsUrl,
  instant,
  text,
  textList,
  SHORT_TEXT_MAX_LENGTH,
  TEXT_MAX_LENGTH,
} from './common'

export const MATERIAL_KINDS = ['report', 'website', 'presentation', 'other'] as const

// A material is a link or a short text (for example "printed leaflet"), at least one of the two.
const material = z
  .strictObject({
    kind: z.enum(MATERIAL_KINDS),
    url: httpsUrl.optional(),
    text: text(SHORT_TEXT_MAX_LENGTH).optional(),
  })
  .refine((item) => item.url !== undefined || item.text !== undefined)

// Targets are free-text names until G-06 (M4) turns them into links to the targets table.
const shape = {
  targets: textList(),
  calledAt: instant,
  materials: z.array(material).max(50).optional(),
  notes: text().optional(),
  asks: text().optional(),
  outcome: text().optional(),
}

export const callWithTargetType: ActivityTypeDefinition = {
  key: 'call_with_target',
  labelKey: 'callWithTarget.label',
  descriptionKey: 'callWithTarget.description',
  selectable: true,
  shape,
  detailsSchema: z.strictObject(shape),
  fields: [
    {
      name: 'targets',
      labelKey: 'callWithTarget.targets',
      input: 'list',
      required: true,
      itemKind: 'text',
      maxLength: SHORT_TEXT_MAX_LENGTH,
    },
    // Entered as local time in the app time zone, stored as an ISO instant (see localToInstant).
    { name: 'calledAt', labelKey: 'callWithTarget.calledAt', input: 'datetime', required: true },
    {
      name: 'materials',
      labelKey: 'callWithTarget.materials',
      input: 'list',
      required: false,
      itemKind: 'material',
      options: MATERIAL_KINDS,
    },
    {
      name: 'notes',
      labelKey: 'callWithTarget.notes',
      input: 'textarea',
      required: false,
      maxLength: TEXT_MAX_LENGTH,
    },
    {
      name: 'asks',
      labelKey: 'callWithTarget.asks',
      input: 'textarea',
      required: false,
      maxLength: TEXT_MAX_LENGTH,
    },
    {
      name: 'outcome',
      labelKey: 'callWithTarget.outcome',
      input: 'textarea',
      required: false,
      maxLength: TEXT_MAX_LENGTH,
    },
  ],
  summarize: (details) => clip(asStrings(details.targets).join(', ')),
}
