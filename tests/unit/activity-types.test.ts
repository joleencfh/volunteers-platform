import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import en from '@/messages/en.json'
import it_ from '@/messages/it.json'
import {
  ACTIVITY_TYPES,
  createRegistry,
  getActivityType,
  isActivityTypeKey,
  localToInstant,
  parseDetailsLoosely,
  selectableTypes,
  type ActivityTypeDefinition,
} from '@/lib/domain/activity-types'

const ok = (type: string, details: unknown) =>
  getActivityType(type)!.detailsSchema.safeParse(details).success

const INSTANT = '2026-12-01T09:30:00.000Z'
const URL_OK = 'https://example.org/doc'

const lookup = (messages: unknown, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], messages)

describe('registry', () => {
  it('holds the five v1 types and offers four in the form', () => {
    expect(ACTIVITY_TYPES.map((t) => t.key)).toEqual([
      'general',
      'campaign',
      'call_with_target',
      'meeting',
      'content_creation',
    ])
    expect(selectableTypes().map((t) => t.key)).toEqual([
      'campaign',
      'call_with_target',
      'meeting',
      'content_creation',
    ])
  })

  it('knows its keys and nothing else', () => {
    expect(isActivityTypeKey('campaign')).toBe(true)
    expect(isActivityTypeKey('general')).toBe(true)
    expect(isActivityTypeKey('nope')).toBe(false)
    expect(isActivityTypeKey(undefined)).toBe(false)
    expect(getActivityType('nope')).toBeUndefined()
  })

  it('refuses duplicate keys', () => {
    expect(() => createRegistry([ACTIVITY_TYPES[0]!, ACTIVITY_TYPES[0]!])).toThrow(/Duplicate/)
  })

  it('accepts a fifth type registered in one place, with no other change', () => {
    const shape = { topic: z.string().min(1) }
    const fake: ActivityTypeDefinition = {
      key: 'workshop',
      labelKey: 'workshop.label',
      descriptionKey: 'workshop.description',
      selectable: true,
      shape,
      detailsSchema: z.strictObject(shape),
      fields: [{ name: 'topic', labelKey: 'workshop.topic', input: 'text', required: true }],
      summarize: (details) => String(details.topic),
    }
    const extended = createRegistry([...ACTIVITY_TYPES, fake])
    expect(extended.all).toHaveLength(6)
    expect(extended.selectable().map((t) => t.key)).toContain('workshop')
    expect(extended.isKey('workshop')).toBe(true)
    expect(extended.get('workshop')!.detailsSchema.safeParse({ topic: 'x' }).success).toBe(true)
    expect(extended.parseLoosely('workshop', { topic: 'x', junk: 1 })).toEqual({ topic: 'x' })
    // The app's own registry is untouched.
    expect(isActivityTypeKey('workshop')).toBe(false)
  })

  it('has labels, descriptions and field labels in both languages', () => {
    for (const messages of [en, it_]) {
      for (const type of ACTIVITY_TYPES) {
        for (const key of [
          type.labelKey,
          type.descriptionKey,
          ...type.fields.map((f) => f.labelKey),
        ]) {
          expect(typeof lookup(messages.activityTypes, key), `${type.key}: ${key}`).toBe('string')
        }
        for (const field of type.fields) {
          for (const option of field.options ?? []) {
            expect(typeof lookup(messages.activityTypes, `options.${option}`), option).toBe(
              'string',
            )
          }
        }
      }
    }
  })

  it('lists a form field for every details key, in the shape', () => {
    for (const type of ACTIVITY_TYPES) {
      expect(type.fields.map((f) => f.name).sort()).toEqual(Object.keys(type.shape).sort())
    }
  })
})

describe('general', () => {
  it('has no fields and refuses any details', () => {
    expect(getActivityType('general')!.fields).toEqual([])
    expect(getActivityType('general')!.selectable).toBe(false)
    expect(ok('general', {})).toBe(true)
    expect(ok('general', { a: 1 })).toBe(false)
    expect(getActivityType('general')!.summarize({})).toBe('')
  })
})

describe('campaign', () => {
  const valid = {
    message: 'Please read our letter',
    sendDate: '2026-12-01',
    targetsContacted: ['Office A', 'Office B'],
    responded: 'Office A',
  }
  it('accepts full and minimal details', () => {
    expect(ok('campaign', valid)).toBe(true)
    expect(ok('campaign', { message: 'https://example.org/letter' })).toBe(true)
  })
  it('refuses the invalid cases', () => {
    expect(ok('campaign', {})).toBe(false) // missing required
    expect(ok('campaign', { message: '   ' })).toBe(false)
    expect(ok('campaign', { message: 'x'.repeat(2001) })).toBe(false) // too long
    expect(ok('campaign', { ...valid, extra: 1 })).toBe(false) // unknown key
    expect(ok('campaign', { ...valid, sendDate: '2026-02-30' })).toBe(false)
    expect(ok('campaign', { ...valid, targetsContacted: [1] })).toBe(false) // wrong item
    expect(ok('campaign', { ...valid, targetsContacted: [] })).toBe(false)
    expect(ok('campaign', { ...valid, targetsContacted: Array(51).fill('a') })).toBe(false)
  })
  it('summarizes', () => {
    const type = getActivityType('campaign')!
    expect(type.summarize(valid)).toBe('Please read our letter (2)')
    expect(type.summarize({ message: 'x'.repeat(200) }).length).toBe(80)
  })
})

describe('call_with_target', () => {
  const valid = {
    targets: ['Dr Rossi'],
    calledAt: INSTANT,
    materials: [
      { kind: 'report', url: URL_OK },
      { kind: 'other', text: 'leaflet' },
    ],
    notes: 'n',
    asks: 'a',
    outcome: 'o',
  }
  it('accepts full and minimal details', () => {
    expect(ok('call_with_target', valid)).toBe(true)
    expect(ok('call_with_target', { targets: ['A'], calledAt: INSTANT })).toBe(true)
  })
  it('refuses the invalid cases', () => {
    expect(ok('call_with_target', { calledAt: INSTANT })).toBe(false)
    expect(ok('call_with_target', { targets: ['A'] })).toBe(false)
    expect(ok('call_with_target', { targets: [], calledAt: INSTANT })).toBe(false)
    expect(ok('call_with_target', { ...valid, calledAt: '2026-12-01T09:30' })).toBe(false)
    expect(ok('call_with_target', { ...valid, extra: 1 })).toBe(false)
    expect(ok('call_with_target', { ...valid, notes: 'x'.repeat(2001) })).toBe(false)
    expect(ok('call_with_target', { ...valid, materials: [{ kind: 'video', text: 'x' }] })).toBe(
      false,
    )
    expect(ok('call_with_target', { ...valid, materials: [{ kind: 'report' }] })).toBe(false)
    expect(
      ok('call_with_target', { ...valid, materials: [{ kind: 'website', url: 'http://x.org' }] }),
    ).toBe(false)
    expect(
      ok('call_with_target', { ...valid, materials: [{ kind: 'other', text: 'x', extra: 1 }] }),
    ).toBe(false)
  })
  it('summarizes', () => {
    expect(getActivityType('call_with_target')!.summarize(valid)).toBe('Dr Rossi')
  })
})

describe('meeting', () => {
  const valid = {
    startsAt: INSTANT,
    meetingUrl: 'https://meet.example.org/abc',
    agendaUrl: URL_OK,
    notesUrl: URL_OK,
  }
  it('accepts full and minimal details', () => {
    expect(ok('meeting', valid)).toBe(true)
    expect(ok('meeting', { startsAt: INSTANT, meetingUrl: URL_OK })).toBe(true)
  })
  it('refuses the invalid cases', () => {
    expect(ok('meeting', { startsAt: INSTANT })).toBe(false)
    expect(ok('meeting', { meetingUrl: URL_OK })).toBe(false)
    expect(ok('meeting', { ...valid, meetingUrl: 'http://meet.example.org' })).toBe(false)
    expect(ok('meeting', { ...valid, meetingUrl: 'javascript:alert(1)' })).toBe(false)
    expect(ok('meeting', { ...valid, agendaUrl: 'https://x.org/' + 'a'.repeat(500) })).toBe(false)
    expect(ok('meeting', { ...valid, notesUrl: 'not a url' })).toBe(false)
    expect(ok('meeting', { ...valid, extra: 1 })).toBe(false)
  })
  it('summarizes', () => {
    expect(getActivityType('meeting')!.summarize(valid)).toBe('meet.example.org')
  })
})

describe('content_creation', () => {
  it('accepts details with and without the result link', () => {
    expect(ok('content_creation', { outputType: 'presentation' })).toBe(true)
    expect(ok('content_creation', { outputType: 'social_post', resultUrl: URL_OK })).toBe(true)
  })
  it('refuses the invalid cases', () => {
    expect(ok('content_creation', {})).toBe(false)
    expect(ok('content_creation', { outputType: 'video' })).toBe(false)
    expect(ok('content_creation', { outputType: 'info_material', resultUrl: 'ftp://x.org' })).toBe(
      false,
    )
    expect(ok('content_creation', { outputType: 'info_material', extra: 1 })).toBe(false)
  })
  it('summarizes', () => {
    const type = getActivityType('content_creation')!
    expect(type.summarize({ outputType: 'presentation', resultUrl: URL_OK })).toBe(
      'presentation - example.org',
    )
    expect(type.summarize({ outputType: 'presentation' })).toBe('presentation')
  })
})

describe('parseDetailsLoosely', () => {
  it('keeps the known valid fields and drops the rest', () => {
    expect(
      parseDetailsLoosely('meeting', {
        startsAt: INSTANT,
        meetingUrl: 'http://bad.example.org',
        agendaUrl: URL_OK,
        oldField: 'legacy',
      }),
    ).toEqual({ startsAt: INSTANT, agendaUrl: URL_OK })
  })
  it('never throws on odd input', () => {
    expect(parseDetailsLoosely('nope', { a: 1 })).toEqual({})
    expect(parseDetailsLoosely('campaign', null)).toEqual({})
    expect(parseDetailsLoosely('campaign', [1])).toEqual({})
    expect(parseDetailsLoosely('campaign', 'text')).toEqual({})
    expect(parseDetailsLoosely('campaign', { message: 5 })).toEqual({})
  })
})

describe('localToInstant', () => {
  it('converts local time in the app zone to an instant', () => {
    expect(localToInstant('2026-12-01T10:30')).toBe('2026-12-01T09:30:00.000Z')
    expect(localToInstant('nonsense')).toBeNull()
  })
})
