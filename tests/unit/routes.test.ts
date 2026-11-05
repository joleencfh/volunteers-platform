import { describe, expect, it } from 'vitest'
import {
  allowedOrigins,
  hasLocalePrefix,
  isAuthRoute,
  isPublicRoute,
  pickRedirectOrigin,
  safeNextPath,
} from '@/lib/domain/routes'

describe('hasLocalePrefix', () => {
  it.each(['/en', '/it', '/en/apply', '/it/privacy'])('recognises %s', (path) => {
    expect(hasLocalePrefix(path)).toBe(true)
  })

  it.each(['/', '/login', '/apply', '/privacy', '/admin', '/english', '/items'])(
    'does not treat %s as prefixed',
    (path) => {
      expect(hasLocalePrefix(path)).toBe(false)
    },
  )
})

describe('isPublicRoute', () => {
  it.each([
    '/',
    '/login',
    '/privacy',
    '/apply',
    '/apply/pending',
    '/apply/rejected',
    '/auth/callback',
  ])('allows %s without a session', (path) => expect(isPublicRoute(path)).toBe(true))

  it.each([
    '/admin',
    '/admin/applications',
    '/applying',
    '/loginx',
    '/privacy-policy',
    '/dev/style',
  ])('requires a session for %s', (path) => expect(isPublicRoute(path)).toBe(false))

  it('opens /dev only when asked', () => {
    expect(isPublicRoute('/dev/style', true)).toBe(true)
    expect(isPublicRoute('/devices', true)).toBe(false)
  })
})

describe('isAuthRoute', () => {
  it('matches /auth and below only', () => {
    expect(isAuthRoute('/auth/callback')).toBe(true)
    expect(isAuthRoute('/authors')).toBe(false)
  })
})

describe('safeNextPath', () => {
  it('keeps a plain same-site path', () => {
    expect(safeNextPath('/admin')).toBe('/admin')
    expect(safeNextPath('/tasks?filter=mine')).toBe('/tasks?filter=mine')
  })

  it.each([
    undefined,
    null,
    '',
    'admin',
    '//evil.example',
    '/\\evil.example',
    'https://evil.example',
    '/ok\nSet-Cookie: x=1',
    '/auth/callback?next=/',
    '/login',
  ])('falls back to the home page for %j', (value) => {
    expect(safeNextPath(value)).toBe('/')
  })
})

describe('redirect origins', () => {
  it('allows localhost outside production and nothing in production without a site URL', () => {
    expect(allowedOrigins(undefined, false)).toEqual([
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ])
    expect(allowedOrigins(undefined, true)).toEqual([])
  })

  it('adds the site origin and ignores an unparsable value', () => {
    expect(allowedOrigins('https://app.example.test/some/path', true)).toEqual([
      'https://app.example.test',
    ])
    expect(allowedOrigins('not a url', true)).toEqual([])
  })

  it('accepts only allowlisted request origins', () => {
    const allowed = allowedOrigins('https://app.example.test', true)
    expect(pickRedirectOrigin('https://app.example.test', allowed)).toBe('https://app.example.test')
    expect(pickRedirectOrigin('https://evil.example', allowed)).toBeNull()
    expect(pickRedirectOrigin(null, allowed)).toBeNull()
  })
})
