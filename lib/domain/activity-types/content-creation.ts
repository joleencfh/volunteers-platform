import { z } from 'zod'
import type { ActivityTypeDefinition } from './types'
import { asString, hostOf, httpsUrl } from './common'

export const OUTPUT_TYPES = ['presentation', 'social_post', 'info_material'] as const

// The result link is optional until the activity is done.
const shape = {
  outputType: z.enum(OUTPUT_TYPES),
  resultUrl: httpsUrl.optional(),
}

export const contentCreationType: ActivityTypeDefinition = {
  key: 'content_creation',
  labelKey: 'contentCreation.label',
  descriptionKey: 'contentCreation.description',
  selectable: true,
  shape,
  detailsSchema: z.strictObject(shape),
  fields: [
    {
      name: 'outputType',
      labelKey: 'contentCreation.outputType',
      input: 'select',
      required: true,
      options: OUTPUT_TYPES,
    },
    {
      name: 'resultUrl',
      labelKey: 'contentCreation.resultUrl',
      input: 'url',
      required: false,
      maxLength: 500,
    },
  ],
  summarize: (details) =>
    [asString(details.outputType), hostOf(details.resultUrl)].filter(Boolean).join(' - '),
}
