import { describe, expect, it } from 'vitest'
import { KNOWLEDGE_LEVELS } from '@/lib/domain/application'
import {
  DEFAULT_TIERS,
  effectiveTier,
  FIXED_FIELDS,
  parseProfileForm,
  PROFILE_FIELDS,
  profileInputSchema,
  VISIBILITY_TIERS,
  visibilityChanges,
} from '@/lib/domain/profile-fields'

const visibility = {
  city: 'admin',
  bio: 'members',
  linkedin_url: 'admin',
  ai_safety_knowledge: 'group',
  ai_risks: 'group',
}

const valid = {
  displayName: ' Ada ',
  city: ' Test City ',
  bio: '',
  linkedinUrl: 'https://www.linkedin.com/in/example',
  aiSafetyKnowledge: 'basic',
  aiRisks: '  ',
  visibility,
}

describe('profile field definitions', () => {
  it('give every optional field a default tier from the tier list', () => {
    expect(Object.keys(DEFAULT_TIERS).sort()).toEqual([...PROFILE_FIELDS].sort())
    for (const field of PROFILE_FIELDS) expect(VISIBILITY_TIERS).toContain(DEFAULT_TIERS[field])
  })

  it('match the defaults of spec section 7', () => {
    expect(DEFAULT_TIERS).toEqual({
      city: 'admin',
      bio: 'members',
      linkedin_url: 'admin',
      ai_safety_knowledge: 'group',
      ai_risks: 'group',
    })
  })

  it('keep fixed fields out of the optional ones', () => {
    for (const field of FIXED_FIELDS) expect(PROFILE_FIELDS).not.toContain(field)
  })
})

describe('effectiveTier', () => {
  it('uses the chosen tier when there is one', () => {
    expect(effectiveTier('members', 'city')).toBe('members')
    expect(effectiveTier('admin', 'bio')).toBe('admin')
  })

  it.each(PROFILE_FIELDS)('falls back to the default for %s', (field) => {
    expect(effectiveTier(null, field)).toBe(DEFAULT_TIERS[field])
    expect(effectiveTier(undefined, field)).toBe(DEFAULT_TIERS[field])
  })
})

describe('profileInputSchema', () => {
  it('trims values and stores blank optional fields as null', () => {
    expect(profileInputSchema.parse(valid)).toEqual({
      displayName: 'Ada',
      city: 'Test City',
      bio: null,
      linkedinUrl: 'https://www.linkedin.com/in/example',
      aiSafetyKnowledge: 'basic',
      aiRisks: null,
      visibility,
    })
  })

  it('accepts every knowledge level and none chosen', () => {
    for (const level of KNOWLEDGE_LEVELS) {
      expect(
        profileInputSchema.parse({ ...valid, aiSafetyKnowledge: level }).aiSafetyKnowledge,
      ).toBe(level)
    }
    expect(profileInputSchema.parse({ ...valid, aiSafetyKnowledge: '' }).aiSafetyKnowledge).toBe(
      null,
    )
  })

  const errorFor = (input: object) => profileInputSchema.safeParse(input).error?.issues[0]?.message

  it('requires a display name and caps its length', () => {
    expect(errorFor({ ...valid, displayName: '   ' })).toBe('required')
    expect(errorFor({ ...valid, displayName: 'x'.repeat(61) })).toBe('tooLong')
  })

  it('caps the free-text fields', () => {
    expect(errorFor({ ...valid, city: 'x'.repeat(101) })).toBe('tooLong')
    expect(errorFor({ ...valid, bio: 'x'.repeat(501) })).toBe('tooLong')
    expect(errorFor({ ...valid, aiRisks: 'x'.repeat(501) })).toBe('tooLong')
    expect(errorFor({ ...valid, linkedinUrl: `https://example.test/${'x'.repeat(300)}` })).toBe(
      'tooLong',
    )
  })

  it.each([
    'http://www.linkedin.com/in/example',
    'javascript:alert(1)',
    'linkedin.com/in/x',
    'https:x',
  ])('refuses the link %s', (linkedinUrl) => {
    expect(errorFor({ ...valid, linkedinUrl })).toBe('invalidUrl')
  })

  it('accepts no link', () => {
    expect(profileInputSchema.parse({ ...valid, linkedinUrl: ' ' }).linkedinUrl).toBe(null)
  })

  it('refuses an unknown knowledge level or tier', () => {
    expect(errorFor({ ...valid, aiSafetyKnowledge: 'expert' })).toBe('invalidChoice')
    expect(errorFor({ ...valid, visibility: { ...visibility, city: 'public' } })).toBe(
      'invalidChoice',
    )
  })

  it('needs a tier for every optional field', () => {
    const missing = { ...visibility, bio: undefined }
    expect(profileInputSchema.safeParse({ ...valid, visibility: missing }).success).toBe(false)
  })
})

describe('parseProfileForm', () => {
  const form = {
    displayName: 'Ada',
    city: '',
    bio: 'Hello',
    linkedinUrl: '',
    aiSafetyKnowledge: '',
    aiRisks: '',
  }

  it('falls back to the default tiers when no visibility is sent', () => {
    const parsed = parseProfileForm(form)
    expect(parsed.ok && parsed.data.visibility).toEqual(DEFAULT_TIERS)
  })

  it('reads visibility.<field> and stores blank text as null', () => {
    const parsed = parseProfileForm({ ...form, 'visibility.city': 'members' })
    expect(parsed.ok && parsed.data.visibility.city).toBe('members')
    expect(parsed.ok && parsed.data.city).toBeNull()
  })

  it('names the field and the reason for each refusal', () => {
    const parsed = parseProfileForm({
      ...form,
      displayName: '  ',
      linkedinUrl: 'http://example.test',
      'visibility.bio': 'everyone',
    })
    expect(parsed).toEqual({
      ok: false,
      errors: { displayName: 'required', linkedinUrl: 'invalidUrl', bio: 'invalidChoice' },
    })
  })

  it('treats a value that is not text as blank', () => {
    expect(parseProfileForm({ ...form, displayName: undefined }).ok).toBe(false)
  })
})

describe('visibilityChanges', () => {
  it('stores only choices that differ from the default and clears the others', () => {
    const changes = visibilityChanges({ ...DEFAULT_TIERS, city: 'members', bio: 'admin' })
    expect(changes.store).toEqual([
      { field: 'city', tier: 'members' },
      { field: 'bio', tier: 'admin' },
    ])
    expect(changes.clear).toEqual(['linkedin_url', 'ai_safety_knowledge', 'ai_risks'])
  })
})
