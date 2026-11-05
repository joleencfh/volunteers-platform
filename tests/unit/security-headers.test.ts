import { describe, expect, it } from 'vitest'
import { buildCsp, securityHeaders } from '@/lib/security-headers'

describe('buildCsp', () => {
  const csp = buildCsp({ supabaseUrl: 'https://abc.supabase.co' })

  it('forbids framing, plugins and foreign base tags', () => {
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain("form-action 'self'")
  })

  it('lets the browser reach Supabase over https and websockets, and nothing else', () => {
    expect(csp).toContain("connect-src 'self' https://abc.supabase.co wss://abc.supabase.co")
  })

  it('has no eval in production and upgrades insecure requests', () => {
    expect(csp).not.toContain('unsafe-eval')
    expect(csp).toContain('upgrade-insecure-requests')
  })

  it('allows eval and the hot-reload socket only in development', () => {
    const dev = buildCsp({ supabaseUrl: 'https://abc.supabase.co', isDev: true })
    expect(dev).toContain("'unsafe-eval'")
    expect(dev).toContain('ws://localhost:*')
    expect(dev).not.toContain('upgrade-insecure-requests')
  })

  it('works without a Supabase URL or with an invalid one', () => {
    expect(buildCsp()).toContain("connect-src 'self';")
    expect(buildCsp({ supabaseUrl: 'not a url' })).toContain("connect-src 'self';")
  })
})

describe('securityHeaders', () => {
  it('sets every header the baseline requires', () => {
    const keys = securityHeaders().map((h) => h.key)
    expect(keys).toEqual([
      'Content-Security-Policy',
      'X-Frame-Options',
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Permissions-Policy',
      'Strict-Transport-Security',
    ])
  })
})
