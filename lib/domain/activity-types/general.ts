import { z } from 'zod'
import { GENERAL_ACTIVITY_TYPE } from '../activities'
import type { ActivityTypeDefinition } from './types'

const shape = {}

/** The group's standing activity: created by the database, no extra fields, never offered in the form. */
export const generalType: ActivityTypeDefinition = {
  key: GENERAL_ACTIVITY_TYPE,
  labelKey: 'general.label',
  descriptionKey: 'general.description',
  selectable: false,
  shape,
  detailsSchema: z.strictObject(shape),
  fields: [],
  summarize: () => '',
}
