import type { SupabaseClient, User } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Database } from '@/lib/database.types'
import { findMember } from '@/lib/authz/member'

vi.mock('server-only', () => ({}))

const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT ${path}`)
})
const notFound = vi.fn(() => {
  throw new Error('NOT_FOUND')
})
vi.mock('next/navigation', () => ({
  redirect: (path: string) => redirect(path),
  notFound: () => notFound(),
}))

let signedInUser: User | null = null
let row: Record<string, unknown> | null = null
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => fakeClient(),
}))

function fakeClient() {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: row, error: null }),
  }
  return {
    auth: { getUser: async () => ({ data: { user: signedInUser } }) },
    from: () => query,
  } as unknown as SupabaseClient<Database>
}

const user = (overrides: Partial<User> = {}) =>
  ({
    id: 'u1',
    email: 'ada@example.test',
    email_confirmed_at: '2026-11-05T10:00:00Z',
    identities: [],
    ...overrides,
  }) as User

const memberRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'u1',
  email: 'ada@example.test',
  display_name: 'Ada',
  level: 'new',
  is_admin: false,
  status: 'active',
  locale: 'en',
  ...overrides,
})

beforeEach(() => {
  signedInUser = null
  row = null
  redirect.mockClear()
  notFound.mockClear()
})

describe('findMember', () => {
  it('returns the member for an active matching row', async () => {
    row = memberRow({ is_admin: true })
    expect(await findMember(fakeClient(), user())).toEqual({
      id: 'u1',
      email: 'ada@example.test',
      displayName: 'Ada',
      level: 'new',
      isAdmin: true,
      locale: 'en',
    })
  })

  it('carries the stored language and falls back to English for an unknown one', async () => {
    row = memberRow({ locale: 'it' })
    expect((await findMember(fakeClient(), user()))?.locale).toBe('it')
    row = memberRow({ locale: 'xx' })
    expect((await findMember(fakeClient(), user()))?.locale).toBe('en')
  })

  it('returns null without a row, for a deactivated user, a different email or an unverified one', async () => {
    expect(await findMember(fakeClient(), user())).toBeNull()
    row = memberRow({ status: 'deactivated' })
    expect(await findMember(fakeClient(), user())).toBeNull()
    row = memberRow({ email: 'someone-else@example.test' })
    expect(await findMember(fakeClient(), user())).toBeNull()
    row = memberRow()
    expect(await findMember(fakeClient(), user({ email_confirmed_at: undefined }))).toBeNull()
  })
})

describe('requireUser', () => {
  it('sends a logged-out visitor to /login', async () => {
    const { requireUser } = await import('@/lib/authz')
    await expect(requireUser()).rejects.toThrow('REDIRECT /login')
  })

  it('sends a signed-in person without a member record to /login with the refusal flag', async () => {
    const { requireUser } = await import('@/lib/authz')
    signedInUser = user()
    await expect(requireUser()).rejects.toThrow('REDIRECT /login?error=signin')
  })

  it('returns the member', async () => {
    const { requireUser } = await import('@/lib/authz')
    signedInUser = user()
    row = memberRow()
    expect(await requireUser()).toMatchObject({ id: 'u1', isAdmin: false })
  })
})

describe('requireAdmin', () => {
  it('refuses a member who is not an admin', async () => {
    const { requireAdmin } = await import('@/lib/authz')
    signedInUser = user()
    row = memberRow()
    await expect(requireAdmin()).rejects.toThrow('NOT_FOUND')
  })

  it('refuses a logged-out visitor', async () => {
    const { requireAdmin } = await import('@/lib/authz')
    await expect(requireAdmin()).rejects.toThrow('REDIRECT /login')
  })

  it('returns an active admin, reading the flag from the database row', async () => {
    const { requireAdmin } = await import('@/lib/authz')
    signedInUser = user({ app_metadata: { is_admin: false } })
    row = memberRow({ is_admin: true })
    expect(await requireAdmin()).toMatchObject({ isAdmin: true })
  })
})
