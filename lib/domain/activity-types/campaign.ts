import { z } from 'zod'
import type { ActivityTypeDefinition } from './types'
import {
  asString,
  asStrings,
  clip,
  dateOnly,
  text,
  textList,
  SHORT_TEXT_MAX_LENGTH,
  TEXT_MAX_LENGTH,
} from './common'

// Targets contacted are free-text names until G-06 (M4) turns them into links to the targets table.
// Volunteers participating come from the activity's participants, so there is no field for them.
const shape = {
  message: text(),
  sendDate: dateOnly.optional(),
  targetsContacted: textList().optional(),
  responded: text().optional(),
}

export const campaignType: ActivityTypeDefinition = {
  key: 'campaign',
  labelKey: 'campaign.label',
  descriptionKey: 'campaign.description',
  selectable: true,
  shape,
  detailsSchema: z.strictObject(shape),
  fields: [
    {
      name: 'message',
      labelKey: 'campaign.message',
      input: 'textarea',
      required: true,
      maxLength: TEXT_MAX_LENGTH,
    },
    { name: 'sendDate', labelKey: 'campaign.sendDate', input: 'date', required: false },
    {
      name: 'targetsContacted',
      labelKey: 'campaign.targetsContacted',
      input: 'list',
      required: false,
      itemKind: 'text',
      maxLength: SHORT_TEXT_MAX_LENGTH,
    },
    {
      name: 'responded',
      labelKey: 'campaign.responded',
      input: 'textarea',
      required: false,
      maxLength: TEXT_MAX_LENGTH,
    },
  ],
  summarize(details) {
    const count = asStrings(details.targetsContacted).length
    const message = clip(asString(details.message))
    return count > 0 ? `${message} (${count})` : message
  },
}
