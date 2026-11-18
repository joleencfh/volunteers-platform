import { describe, expect, it } from 'vitest'
import {
  parseActivityCommon,
  parseActivityFilters,
  parseSelectableType,
  readDetails,
  toDetailDefaults,
} from '@/lib/domain/activity-input'
import { getActivityType, selectableTypes } from '@/lib/domain/activity-types'

const source = (values: Record<string, string>) => ({
  get: (name: string) => values[name] ?? null,
})

describe('parseActivityFilters', () => {
  it('accepts a known status and type', () => {
    expect(parseActivityFilters({ status: 'active', type: 'campaign' })).toEqual({
      status: 'active',
      type: 'campaign',
    })
  })

  it('ignores unknown, empty and repeated values', () => {
    expect(parseActivityFilters({ status: 'nope', type: 'nope' })).toEqual({
      status: null,
      type: null,
    })
    expect(parseActivityFilters({})).toEqual({ status: null, type: null })
    expect(parseActivityFilters({ status: ['done', 'active'], type: ['meeting'] })).toEqual({
      status: 'done',
      type: 'meeting',
    })
  })
})

describe('parseSelectableType', () => {
  it('offers only selectable types (never General)', () => {
    const types = selectableTypes()
    expect(parseSelectableType('meeting', types)).toBe('meeting')
    expect(parseSelectableType('general', types)).toBeNull()
    expect(parseSelectableType(undefined, types)).toBeNull()
  })
})

describe('parseActivityCommon', () => {
  it('reads the common fields, with defaults', () => {
    const result = parseActivityCommon(source({ title: '  Letter to MPs ' }))
    expect(result).toEqual({
      ok: true,
      data: {
        title: 'Letter to MPs',
        description: undefined,
        status: 'planned',
        startsOn: undefined,
        dueOn: undefined,
        keyActivity: false,
        links: [],
      },
    })
  })

  it('reads links, the key flag and dates', () => {
    const result = parseActivityCommon(
      source({
        title: 'A',
        status: 'active',
        keyActivity: 'on',
        startsOn: '2026-12-01',
        dueOn: '2026-12-31',
        'links.label.0': 'Plan',
        'links.url.0': 'https://example.test/plan',
        'links.label.1': '',
        'links.url.1': '',
      }),
    )
    expect(result.ok && result.data.links).toEqual([
      { label: 'Plan', url: 'https://example.test/plan' },
    ])
    expect(result.ok && result.data.keyActivity).toBe(true)
  })

  it.each([
    ['a blank title', { title: '  ' }],
    ['a title that is too long', { title: 'x'.repeat(121) }],
    ['an unknown status', { title: 'A', status: 'archived' }],
    [
      'a due date before the start date',
      { title: 'A', startsOn: '2026-12-10', dueOn: '2026-12-01' },
    ],
    ['an impossible date', { title: 'A', dueOn: '2026-02-31' }],
    ['a link without https', { title: 'A', 'links.label.0': 'x', 'links.url.0': 'http://x.test' }],
    ['a link without a label', { title: 'A', 'links.url.0': 'https://x.test' }],
  ])('refuses %s', (_name, values) => {
    expect(parseActivityCommon(source(values)).ok).toBe(false)
  })
})

describe('readDetails', () => {
  it('reads text, lists and an instant, leaving blanks out', () => {
    const call = getActivityType('call_with_target')!
    const details = readDetails(
      call.fields,
      source({
        'details.targets': 'Ada Rossi\n\n  Luca Bianchi ',
        'details.calledAt': '2026-07-15T20:30',
        'details.notes': '',
      }),
    )
    expect(details).toEqual({
      targets: ['Ada Rossi', 'Luca Bianchi'],
      calledAt: '2026-07-15T18:30:00.000Z',
    })
    expect(call.detailsSchema.safeParse(details).success).toBe(true)
  })

  it('reads material rows as a link or a text', () => {
    const call = getActivityType('call_with_target')!
    const details = readDetails(
      call.fields,
      source({
        'details.materials.kind.0': 'report',
        'details.materials.value.0': 'https://example.test/report',
        'details.materials.kind.1': 'other',
        'details.materials.value.1': 'printed leaflet',
        'details.materials.value.2': '',
      }),
    )
    expect(details.materials).toEqual([
      { kind: 'report', url: 'https://example.test/report' },
      { kind: 'other', text: 'printed leaflet' },
    ])
  })

  it('keeps an unreadable date-time as typed so the schema refuses it', () => {
    const call = getActivityType('call_with_target')!
    const details = readDetails(
      call.fields,
      source({ 'details.targets': 'Ada', 'details.calledAt': 'tomorrow' }),
    )
    expect(call.detailsSchema.safeParse(details).success).toBe(false)
  })

  it('produces details the campaign schema accepts, and refuses a missing required field', () => {
    const campaign = getActivityType('campaign')!
    const ok = readDetails(campaign.fields, source({ 'details.message': 'Please sign' }))
    expect(campaign.detailsSchema.safeParse(ok).success).toBe(true)
    const missing = readDetails(campaign.fields, source({ 'details.responded': 'Nobody' }))
    expect(campaign.detailsSchema.safeParse(missing).success).toBe(false)
  })
})

describe('toDetailDefaults', () => {
  it('turns stored details back into form values, the inverse of readDetails', () => {
    const definition = getActivityType('call_with_target')!
    const details = {
      targets: ['Alice', 'Bob'],
      calledAt: '2026-07-15T18:30:00.000Z',
      materials: [
        { kind: 'report', url: 'https://example.org/r' },
        { kind: 'other', text: 'printed leaflet' },
      ],
      notes: 'Went well',
    }
    const defaults = toDetailDefaults(definition.fields, details)
    expect(defaults.values.targets).toBe('Alice\nBob')
    expect(defaults.values.calledAt).toBe('2026-07-15T20:30')
    expect(defaults.values.notes).toBe('Went well')
    expect(defaults.materials.materials).toEqual([
      { kind: 'report', value: 'https://example.org/r' },
      { kind: 'other', value: 'printed leaflet' },
    ])
    // Round trip through the reader.
    const submitted: Record<string, string> = {
      'details.targets': defaults.values.targets!,
      'details.calledAt': defaults.values.calledAt!,
      'details.materials.kind.0': 'report',
      'details.materials.value.0': 'https://example.org/r',
      'details.materials.kind.1': 'other',
      'details.materials.value.1': 'printed leaflet',
      'details.notes': 'Went well',
    }
    expect(
      definition.detailsSchema.safeParse(readDetails(definition.fields, source(submitted))).success,
    ).toBe(true)
  })

  it('skips values of the wrong shape and missing fields', () => {
    const definition = getActivityType('call_with_target')!
    const defaults = toDetailDefaults(definition.fields, {
      targets: 'not a list',
      calledAt: 'not a date',
      materials: 'nope',
    })
    expect(defaults.values).toEqual({})
    expect(defaults.materials).toEqual({})
  })
})
