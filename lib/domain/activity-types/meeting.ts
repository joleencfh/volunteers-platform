import { z } from 'zod'
import type { ActivityTypeDefinition } from './types'
import { hostOf, httpsUrl, instant } from './common'

const shape = {
  startsAt: instant,
  meetingUrl: httpsUrl,
  agendaUrl: httpsUrl.optional(),
  notesUrl: httpsUrl.optional(),
}

export const meetingType: ActivityTypeDefinition = {
  key: 'meeting',
  labelKey: 'meeting.label',
  descriptionKey: 'meeting.description',
  selectable: true,
  shape,
  detailsSchema: z.strictObject(shape),
  fields: [
    { name: 'startsAt', labelKey: 'meeting.startsAt', input: 'datetime', required: true },
    {
      name: 'meetingUrl',
      labelKey: 'meeting.meetingUrl',
      input: 'url',
      required: true,
      maxLength: 500,
    },
    {
      name: 'agendaUrl',
      labelKey: 'meeting.agendaUrl',
      input: 'url',
      required: false,
      maxLength: 500,
    },
    {
      name: 'notesUrl',
      labelKey: 'meeting.notesUrl',
      input: 'url',
      required: false,
      maxLength: 500,
    },
  ],
  summarize: (details) => hostOf(details.meetingUrl),
}
