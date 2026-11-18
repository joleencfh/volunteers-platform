import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_STATUSES,
  canArchiveActivity,
  canCreateInGroup,
  canEditActivity,
  hasCompletionEvidence,
  PARTICIPANT_ROLES,
  participantRoleFor,
  refusalFromDbCode,
  TASK_STATUSES,
  toLimitedActivities,
  type LimitedActivityRow,
  type ActivityActor,
} from '@/lib/domain/activities'

type Level = 'new' | 'fresh' | 'experienced'

const person = (level: Level, overrides: Partial<ActivityActor> = {}): ActivityActor => ({
  level,
  isAdmin: false,
  isMember: true,
  isCreator: false,
  isLead: false,
  ...overrides,
})

describe('lists', () => {
  it('match the database enums', () => {
    expect(ACTIVITY_STATUSES).toEqual(['planned', 'active', 'done', 'cancelled'])
    expect(PARTICIPANT_ROLES).toEqual(['participant', 'observer'])
    expect(TASK_STATUSES).toEqual(['open', 'in_progress', 'done'])
  })
})

describe('canCreateInGroup', () => {
  it('allows fresh and experienced members and admins', () => {
    expect(canCreateInGroup(person('fresh'))).toBe(true)
    expect(canCreateInGroup(person('experienced'))).toBe(true)
    expect(canCreateInGroup(person('new', { isAdmin: true, isMember: false }))).toBe(true)
  })

  it('refuses new members and non-members', () => {
    expect(canCreateInGroup(person('new'))).toBe(false)
    expect(canCreateInGroup(person('experienced', { isMember: false }))).toBe(false)
  })
})

describe('canEditActivity', () => {
  it('allows admins, experienced members, and the creator or lead', () => {
    expect(canEditActivity(person('new', { isAdmin: true, isMember: false }))).toBe(true)
    expect(canEditActivity(person('experienced'))).toBe(true)
    expect(canEditActivity(person('fresh', { isCreator: true }))).toBe(true)
    expect(canEditActivity(person('fresh', { isLead: true }))).toBe(true)
  })

  it("refuses a fresh or new member on someone else's activity, and non-members", () => {
    expect(canEditActivity(person('fresh'))).toBe(false)
    expect(canEditActivity(person('new'))).toBe(false)
    expect(canEditActivity(person('experienced', { isMember: false }))).toBe(false)
    expect(canEditActivity(person('fresh', { isMember: false, isCreator: true }))).toBe(false)
  })
})

describe('canArchiveActivity', () => {
  it('allows admins, experienced members and the creator', () => {
    expect(canArchiveActivity(person('new', { isAdmin: true, isMember: false }))).toBe(true)
    expect(canArchiveActivity(person('experienced'))).toBe(true)
    expect(canArchiveActivity(person('fresh', { isCreator: true }))).toBe(true)
  })

  it('refuses the lead alone, other fresh members and non-members', () => {
    expect(canArchiveActivity(person('fresh', { isLead: true }))).toBe(false)
    expect(canArchiveActivity(person('fresh'))).toBe(false)
    expect(canArchiveActivity(person('experienced', { isMember: false }))).toBe(false)
  })
})

describe('participantRoleFor', () => {
  it('lets a new volunteer only observe', () => {
    expect(participantRoleFor('new', false)).toEqual(['observer'])
  })

  it('lets fresh and experienced members and admins choose', () => {
    expect(participantRoleFor('fresh', false)).toEqual(['participant', 'observer'])
    expect(participantRoleFor('experienced', false)).toEqual(['participant', 'observer'])
    expect(participantRoleFor('new', true)).toEqual(['participant', 'observer'])
  })
})

describe('hasCompletionEvidence', () => {
  it('accepts a note, a link or both', () => {
    expect(hasCompletionEvidence('Replied to the email', null)).toBe(true)
    expect(hasCompletionEvidence(null, 'https://example.test/doc')).toBe(true)
    expect(hasCompletionEvidence('Done', 'https://example.test/doc')).toBe(true)
  })

  it('refuses neither, or a blank note', () => {
    expect(hasCompletionEvidence(null, null)).toBe(false)
    expect(hasCompletionEvidence('   ', null)).toBe(false)
  })
})

describe('toLimitedActivities', () => {
  const row = (overrides: Partial<LimitedActivityRow>): LimitedActivityRow => ({
    id: 'a',
    title: 'Campaign',
    status: 'planned',
    type: 'campaign',
    key_activity: false,
    is_general: false,
    archived: false,
    ...overrides,
  })

  it('maps the columns and lists the General activity first, keeping the rest in order', () => {
    const rows = [
      row({ id: 'b', title: 'Second', key_activity: true }),
      row({ id: 'g', title: 'General', status: 'active', type: 'general', is_general: true }),
      row({ id: 'c', title: 'Third', archived: true }),
    ]
    expect(toLimitedActivities(rows)).toEqual([
      {
        id: 'g',
        title: 'General',
        status: 'active',
        type: 'general',
        isKey: false,
        isGeneral: true,
        archived: false,
      },
      {
        id: 'b',
        title: 'Second',
        status: 'planned',
        type: 'campaign',
        isKey: true,
        isGeneral: false,
        archived: false,
      },
      {
        id: 'c',
        title: 'Third',
        status: 'planned',
        type: 'campaign',
        isKey: false,
        isGeneral: false,
        archived: true,
      },
    ])
  })

  it('drops a row with a status the app does not know', () => {
    expect(toLimitedActivities([row({ status: 'paused' })])).toEqual([])
  })
})

describe('refusalFromDbCode', () => {
  it.each([
    ['42501', 'notAllowed'],
    ['P0002', 'notFound'],
    ['22023', 'invalid'],
    ['23514', 'invalid'],
    ['23502', 'invalid'],
    ['22P02', 'invalid'],
    ['55000', 'conflict'],
    ['23505', 'conflict'],
    ['08006', 'unavailable'],
    [undefined, 'unavailable'],
  ] as const)('maps %s to %s', (code, refusal) => {
    expect(refusalFromDbCode(code)).toBe(refusal)
  })
})
