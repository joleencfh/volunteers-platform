import { describe, expect, it } from 'vitest'
import { isEmailVerified, mayEnter, normalizeEmail } from '@/lib/domain/membership'

const active = { email: 'Ada@Example.test', status: 'active' as const }

describe('mayEnter', () => {
  it('admits a verified identity whose email matches an active member, ignoring case', () => {
    expect(mayEnter({ email: 'ada@example.TEST', verified: true }, active)).toBe(true)
  })

  it('refuses everyone without an active matching member record', () => {
    expect(mayEnter({ email: 'ada@example.test', verified: true }, null)).toBe(false)
    expect(
      mayEnter({ email: 'ada@example.test', verified: true }, { ...active, status: 'deactivated' }),
    ).toBe(false)
    expect(mayEnter({ email: 'other@example.test', verified: true }, active)).toBe(false)
    expect(mayEnter({ email: null, verified: true }, active)).toBe(false)
  })

  it('refuses an unverified email even when it matches', () => {
    expect(mayEnter({ email: 'ada@example.test', verified: false }, active)).toBe(false)
  })
})

describe('isEmailVerified', () => {
  it('needs a confirmed email', () => {
    expect(isEmailVerified({ email_confirmed_at: null })).toBe(false)
    expect(isEmailVerified({ email_confirmed_at: '2026-11-05T10:00:00Z' })).toBe(true)
  })

  it('refuses a Google identity that does not report the email as verified', () => {
    const base = { email_confirmed_at: '2026-11-05T10:00:00Z' }
    const google = (verified: unknown) => ({
      ...base,
      identities: [{ provider: 'google', identity_data: { email_verified: verified } }],
    })
    expect(isEmailVerified(google(true))).toBe(true)
    expect(isEmailVerified(google(false))).toBe(false)
    expect(isEmailVerified(google(undefined))).toBe(false)
    expect(isEmailVerified({ ...base, identities: [{ provider: 'email' }] })).toBe(true)
  })
})

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Ada@Example.TEST ')).toBe('ada@example.test')
  })
})
