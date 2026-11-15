import { describe, expect, it } from 'vitest'
import {
  canApproveJoin,
  canAssignLead,
  canEditGroupContent,
  GROUP_SLUG_MAX_LENGTH,
  isValidSlug,
  toGroupView,
} from '@/lib/domain/groups'

const member = (level: 'new' | 'fresh' | 'experienced') => ({
  level,
  isAdmin: false,
  isMember: true,
})
const outsider = (level: 'new' | 'fresh' | 'experienced') => ({
  level,
  isAdmin: false,
  isMember: false,
})
const admin = { level: 'new', isAdmin: true, isMember: false } as const

describe('canApproveJoin', () => {
  it('allows fresh and experienced members and admins', () => {
    expect(canApproveJoin(member('fresh'))).toBe(true)
    expect(canApproveJoin(member('experienced'))).toBe(true)
    expect(canApproveJoin(admin)).toBe(true)
  })

  it('refuses new members and anyone outside the group', () => {
    expect(canApproveJoin(member('new'))).toBe(false)
    expect(canApproveJoin(outsider('experienced'))).toBe(false)
  })
})

describe('canAssignLead', () => {
  it('allows experienced members and admins', () => {
    expect(canAssignLead(member('experienced'))).toBe(true)
    expect(canAssignLead(admin)).toBe(true)
  })

  it('refuses new and fresh members and experienced people outside the group', () => {
    expect(canAssignLead(member('new'))).toBe(false)
    expect(canAssignLead(member('fresh'))).toBe(false)
    expect(canAssignLead(outsider('experienced'))).toBe(false)
  })
})

describe('canEditGroupContent', () => {
  it('allows fresh and experienced members and admins', () => {
    expect(canEditGroupContent(member('fresh'))).toBe(true)
    expect(canEditGroupContent(member('experienced'))).toBe(true)
    expect(canEditGroupContent(admin)).toBe(true)
  })

  it('refuses new members and anyone outside the group', () => {
    expect(canEditGroupContent(member('new'))).toBe(false)
    expect(canEditGroupContent(outsider('fresh'))).toBe(false)
  })
})

describe('isValidSlug', () => {
  it.each(['lobbying', 'outreach-2027', 'a', 'x1-y2-z3'])('accepts %s', (slug) => {
    expect(isValidSlug(slug)).toBe(true)
  })

  it.each([
    '',
    'Lobbying',
    'two words',
    '-lead',
    'trail-',
    'double--hyphen',
    'àccent',
    'under_score',
  ])('refuses "%s"', (slug) => {
    expect(isValidSlug(slug)).toBe(false)
  })

  it('limits the length', () => {
    expect(isValidSlug('a'.repeat(GROUP_SLUG_MAX_LENGTH))).toBe(true)
    expect(isValidSlug('a'.repeat(GROUP_SLUG_MAX_LENGTH + 1))).toBe(false)
  })
})

describe('toGroupView', () => {
  const row = {
    id: 'group-id',
    slug: 'lobbying',
    name: 'Lobbying',
    description: 'Synthetic description.',
    is_member: false,
    archived: false,
    lead_user_id: null,
    lead_display_name: null,
  }

  it('maps a list row for a non-member with no lead and no links', () => {
    expect(toGroupView(row)).toEqual({
      id: 'group-id',
      slug: 'lobbying',
      name: 'Lobbying',
      description: 'Synthetic description.',
      isMember: false,
      archived: false,
      lead: null,
      signalUrl: null,
      docsUrl: null,
    })
  })

  it('maps the lead, membership, archive flag and links of a full row', () => {
    const view = toGroupView({
      ...row,
      is_member: true,
      archived: true,
      lead_user_id: 'lead-id',
      lead_display_name: 'Synthetic Lead',
      signal_url: 'https://signal.example.test/g',
      docs_url: 'https://docs.example.test/g',
    })
    expect(view).toMatchObject({
      isMember: true,
      archived: true,
      lead: { userId: 'lead-id', displayName: 'Synthetic Lead' },
      signalUrl: 'https://signal.example.test/g',
      docsUrl: 'https://docs.example.test/g',
    })
  })

  it('treats null flags as false and a lead without a name as no lead', () => {
    const view = toGroupView({ ...row, is_member: null, archived: null, lead_user_id: 'lead-id' })
    expect(view).toMatchObject({ isMember: false, archived: false, lead: null })
  })
})
