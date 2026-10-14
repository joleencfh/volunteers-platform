import { describe, expect, it } from 'vitest'
import { startOfIsoWeek } from '@/lib/domain/week'

const iso = (date: Date) => date.toISOString()

describe('startOfIsoWeek', () => {
  it('returns the same day at midnight when the date is a Monday', () => {
    expect(iso(startOfIsoWeek(new Date('2026-10-12T15:30:00Z')))).toBe('2026-10-12T00:00:00.000Z')
  })

  it('returns the previous Monday for a Sunday', () => {
    expect(iso(startOfIsoWeek(new Date('2026-10-18T23:59:59Z')))).toBe('2026-10-12T00:00:00.000Z')
  })

  it('returns the Monday of the same week for midweek dates', () => {
    expect(iso(startOfIsoWeek(new Date('2026-10-14T08:00:00Z')))).toBe('2026-10-12T00:00:00.000Z')
  })

  it('crosses month and year boundaries', () => {
    expect(iso(startOfIsoWeek(new Date('2027-01-01T10:00:00Z')))).toBe('2026-12-28T00:00:00.000Z')
  })

  it('does not mutate its input', () => {
    const input = new Date('2026-10-14T08:00:00Z')
    startOfIsoWeek(input)
    expect(iso(input)).toBe('2026-10-14T08:00:00.000Z')
  })
})
