import { describe, expect, it } from 'vitest'
import { assertLocalTarget, isLocalTarget } from '../helpers/local-only'

describe('isLocalTarget', () => {
  it.each([
    'http://127.0.0.1:54321',
    'http://localhost:54321',
    'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    'postgresql://postgres:postgres@localhost:54322/postgres',
    'http://[::1]:54321',
    'http://host.docker.internal:54321',
  ])('treats %s as local', (value) => {
    expect(isLocalTarget(value)).toBe(true)
  })

  it.each([
    'https://abcdefgh.supabase.co',
    'postgresql://postgres.abc:pw@example.com:5432/postgres',
    'http://10.0.0.5:54321',
    'not a url at all',
    '',
  ])('treats %s as remote', (value) => {
    expect(isLocalTarget(value)).toBe(false)
  })
})

describe('assertLocalTarget', () => {
  it('accepts a local target', () => {
    expect(() => assertLocalTarget('URL', 'http://127.0.0.1:54321', {})).not.toThrow()
  })

  it('does nothing when the value is not set', () => {
    expect(() => assertLocalTarget('URL', undefined, {})).not.toThrow()
  })

  it('refuses a remote target and names the variable', () => {
    expect(() => assertLocalTarget('DATABASE_URL', 'https://abc.supabase.co', {})).toThrow(
      /DATABASE_URL does not point at a local database/,
    )
  })

  it('allows a remote target only with ALLOW_REMOTE_TESTS=1', () => {
    const remote = 'https://abc.supabase.co'
    expect(() => assertLocalTarget('URL', remote, { ALLOW_REMOTE_TESTS: '1' })).not.toThrow()
    expect(() => assertLocalTarget('URL', remote, { ALLOW_REMOTE_TESTS: 'yes' })).toThrow()
  })
})
