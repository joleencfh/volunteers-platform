import { describe, expect, it } from 'vitest'
import {
  groupLinksSchema,
  isValidLinkUrl,
  localDateTimeToUtc,
  meetingSchema,
  toLocalDateTime,
} from '@/lib/domain/meetings'

const GROUP = '8b1c2f3e-4d5a-4b6c-8d7e-9f0a1b2c3d4e'
const ROME = 'Europe/Rome'

describe('isValidLinkUrl', () => {
  it('accepts https links', () => {
    expect(isValidLinkUrl('https://meet.example.test/room?x=1')).toBe(true)
  })

  it.each([
    'http://meet.example.test',
    'ftp://meet.example.test',
    'javascript:alert(1)',
    'https://',
    'https://bad host.test',
    ' https://meet.example.test',
    'meet.example.test',
    `https://example.test/${'a'.repeat(500)}`,
  ])('refuses %s', (value) => {
    expect(isValidLinkUrl(value)).toBe(false)
  })

  it('accepts exactly 500 characters', () => {
    const url = `https://example.test/${'a'.repeat(500 - 'https://example.test/'.length)}`
    expect(url).toHaveLength(500)
    expect(isValidLinkUrl(url)).toBe(true)
  })
})

describe('localDateTimeToUtc', () => {
  it('converts winter time (UTC+1)', () => {
    expect(localDateTimeToUtc('2026-01-15T20:30', ROME)?.toISOString()).toBe(
      '2026-01-15T19:30:00.000Z',
    )
  })

  it('converts summer time (UTC+2)', () => {
    expect(localDateTimeToUtc('2026-07-15T20:30', ROME)?.toISOString()).toBe(
      '2026-07-15T18:30:00.000Z',
    )
  })

  it('switches offset across the spring change (2026-03-29 02:00 -> 03:00)', () => {
    expect(localDateTimeToUtc('2026-03-29T01:30', ROME)?.toISOString()).toBe(
      '2026-03-29T00:30:00.000Z',
    )
    expect(localDateTimeToUtc('2026-03-29T03:30', ROME)?.toISOString()).toBe(
      '2026-03-29T01:30:00.000Z',
    )
  })

  it('refuses a time that does not exist when the clocks jump forward', () => {
    expect(localDateTimeToUtc('2026-03-29T02:30', ROME)).toBeNull()
  })

  it('switches offset across the autumn change (2026-10-25 03:00 -> 02:00)', () => {
    expect(localDateTimeToUtc('2026-10-25T01:30', ROME)?.toISOString()).toBe(
      '2026-10-24T23:30:00.000Z',
    )
    expect(localDateTimeToUtc('2026-10-25T03:30', ROME)?.toISOString()).toBe(
      '2026-10-25T02:30:00.000Z',
    )
  })

  it('takes the first of the two times that happen when the clocks go back', () => {
    expect(localDateTimeToUtc('2026-10-25T02:30', ROME)?.toISOString()).toBe(
      '2026-10-25T00:30:00.000Z',
    )
  })

  it('uses the app time zone by default', () => {
    expect(localDateTimeToUtc('2026-01-15T20:30')?.toISOString()).toBe('2026-01-15T19:30:00.000Z')
  })

  it.each(['', '2026-01-15', '2026-01-15 20:30', '2026-13-01T10:00', '2026-02-30T10:00'])(
    'refuses %j',
    (value) => {
      expect(localDateTimeToUtc(value, ROME)).toBeNull()
    },
  )
})

describe('toLocalDateTime', () => {
  it('is the inverse of localDateTimeToUtc', () => {
    for (const local of ['2026-01-15T20:30', '2026-07-15T20:30', '2026-03-29T03:30']) {
      expect(toLocalDateTime(localDateTimeToUtc(local, ROME) as Date, ROME)).toBe(local)
    }
  })
})

describe('meetingSchema', () => {
  const valid = {
    groupId: GROUP,
    startsAt: '2026-07-15T20:30',
    meetingUrl: 'https://meet.example.test/room',
    agendaUrl: '',
  }

  it('stores the UTC instant and turns a blank agenda link into null', () => {
    expect(meetingSchema.parse(valid)).toEqual({
      groupId: GROUP,
      startsAt: '2026-07-15T18:30:00.000Z',
      meetingUrl: 'https://meet.example.test/room',
      agendaUrl: null,
    })
  })

  it('keeps a valid agenda link', () => {
    expect(
      meetingSchema.parse({ ...valid, agendaUrl: 'https://docs.example.test/a' }).agendaUrl,
    ).toBe('https://docs.example.test/a')
  })

  it.each([
    { groupId: 'x' },
    { startsAt: 'tomorrow' },
    { startsAt: '2026-03-29T02:30' },
    { meetingUrl: '' },
    { meetingUrl: 'http://meet.example.test' },
    { agendaUrl: 'not a link' },
  ])('refuses %j', (override) => {
    expect(meetingSchema.safeParse({ ...valid, ...override }).success).toBe(false)
  })
})

describe('groupLinksSchema', () => {
  it('allows both links to be cleared', () => {
    expect(groupLinksSchema.parse({ groupId: GROUP, signalUrl: '', docsUrl: '  ' })).toEqual({
      groupId: GROUP,
      signalUrl: null,
      docsUrl: null,
    })
  })

  it('keeps https links and refuses anything else', () => {
    expect(
      groupLinksSchema.parse({
        groupId: GROUP,
        signalUrl: 'https://signal.group/#x',
        docsUrl: 'https://docs.example.test/d',
      }),
    ).toMatchObject({ signalUrl: 'https://signal.group/#x' })
    expect(
      groupLinksSchema.safeParse({ groupId: GROUP, signalUrl: 'http://x.test', docsUrl: '' })
        .success,
    ).toBe(false)
  })
})
