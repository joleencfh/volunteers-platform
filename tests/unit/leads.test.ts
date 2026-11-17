import { describe, expect, it } from 'vitest'
import {
  LEAD_CHECKLIST,
  LEAD_HISTORY_WEEKS,
  LEAD_WEEKS_AHEAD,
  assignLeadSchema,
  assignableWeeks,
  currentWeekStart,
  historyWeeks,
  isAssignableWeek,
} from '@/lib/domain/leads'

const ID = '8b1c2f3e-4d5a-4b6c-8d7e-9f0a1b2c3d4e'

describe('currentWeekStart', () => {
  it('is the Monday of the week, in UTC', () => {
    expect(currentWeekStart(new Date('2026-11-18T12:00:00Z'))).toBe('2026-11-16')
  })

  it('treats Monday 00:00 UTC as the new week and Sunday 23:59 as the old one', () => {
    expect(currentWeekStart(new Date('2026-11-16T00:00:00Z'))).toBe('2026-11-16')
    expect(currentWeekStart(new Date('2026-11-15T23:59:59Z'))).toBe('2026-11-09')
  })

  it('crosses the year change', () => {
    expect(currentWeekStart(new Date('2027-01-01T10:00:00Z'))).toBe('2026-12-28')
    expect(currentWeekStart(new Date('2024-12-31T10:00:00Z'))).toBe('2024-12-30')
  })
})

describe('isAssignableWeek', () => {
  const now = new Date('2026-11-18T12:00:00Z')

  it('accepts the current week and later Mondays', () => {
    expect(isAssignableWeek('2026-11-16', now)).toBe(true)
    expect(isAssignableWeek('2026-11-23', now)).toBe(true)
    expect(isAssignableWeek('2027-01-04', now)).toBe(true)
  })

  it('refuses a past week', () => {
    expect(isAssignableWeek('2026-11-09', now)).toBe(false)
    expect(isAssignableWeek('2025-11-17', now)).toBe(false)
  })

  it('refuses a date that is not a Monday', () => {
    expect(isAssignableWeek('2026-11-17', now)).toBe(false)
    expect(isAssignableWeek('2026-11-22', now)).toBe(false)
  })

  it('refuses text that is not a real date', () => {
    for (const value of ['', 'next week', '2026-11-1', '2026-02-30', '2026-13-01', '16/11/2026']) {
      expect(isAssignableWeek(value, now)).toBe(false)
    }
  })

  it('uses the Monday boundary at the very start of a week', () => {
    expect(isAssignableWeek('2026-11-16', new Date('2026-11-16T00:00:00Z'))).toBe(true)
    expect(isAssignableWeek('2026-11-16', new Date('2026-11-23T00:00:00Z'))).toBe(false)
  })
})

describe('week lists', () => {
  const now = new Date('2026-12-30T09:00:00Z')

  it('offers the current week and the next four, across the year change', () => {
    const weeks = assignableWeeks(now)
    expect(weeks).toEqual(['2026-12-28', '2027-01-04', '2027-01-11', '2027-01-18', '2027-01-25'])
    expect(weeks).toHaveLength(LEAD_WEEKS_AHEAD + 1)
    for (const week of weeks) expect(isAssignableWeek(week, now)).toBe(true)
  })

  it('lists the history from the current week back, most recent first', () => {
    const weeks = historyWeeks(now)
    expect(weeks).toHaveLength(LEAD_HISTORY_WEEKS)
    expect(weeks.slice(0, 3)).toEqual(['2026-12-28', '2026-12-21', '2026-12-14'])
    expect(weeks.at(-1)).toBe('2026-10-12')
  })
})

describe('assignLeadSchema', () => {
  it('accepts ids and a week as YYYY-MM-DD', () => {
    expect(
      assignLeadSchema.safeParse({ groupId: ID, userId: ID, weekStart: '2026-11-16' }).success,
    ).toBe(true)
  })

  it('refuses a bad id or a malformed week', () => {
    expect(
      assignLeadSchema.safeParse({ groupId: 'x', userId: ID, weekStart: '2026-11-16' }).success,
    ).toBe(false)
    expect(
      assignLeadSchema.safeParse({ groupId: ID, userId: ID, weekStart: '16-11-2026' }).success,
    ).toBe(false)
    expect(
      assignLeadSchema.safeParse({ groupId: ID, userId: ID, weekStart: '2026-02-30' }).success,
    ).toBe(false)
  })
})

describe('LEAD_CHECKLIST', () => {
  it('has the four spec items in order', () => {
    expect(LEAD_CHECKLIST).toEqual(['moderate', 'agenda', 'nextCall', 'tasks'])
  })
})
