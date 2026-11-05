import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const signInWithOtp = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { signInWithOtp } }),
}))

let requestHeaders: Record<string, string> = {}
vi.mock('next/headers', () => ({
  headers: async () => new Headers(requestHeaders),
}))

const form = (email: string) => {
  const data = new FormData()
  data.set('email', email)
  return data
}

async function load() {
  vi.resetModules()
  return (await import('@/app/[lang]/login/actions')).requestMagicLink
}

beforeEach(() => {
  signInWithOtp.mockReset()
  signInWithOtp.mockResolvedValue({ error: null })
  requestHeaders = { origin: 'http://localhost:3000', 'x-forwarded-for': '203.0.113.7' }
})

const idle = { status: 'idle' } as const

describe('requestMagicLink', () => {
  it('rejects a malformed address without calling Supabase', async () => {
    const requestMagicLink = await load()
    expect(await requestMagicLink(idle, form('not-an-email'))).toEqual({ status: 'invalid' })
    expect(signInWithOtp).not.toHaveBeenCalled()
  })

  it('asks Supabase for a link without creating users, redirecting to the callback', async () => {
    const requestMagicLink = await load()
    expect(await requestMagicLink(idle, form('  Ada@Example.test '))).toEqual({ status: 'sent' })
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'ada@example.test',
      options: { shouldCreateUser: false, emailRedirectTo: 'http://localhost:3000/auth/callback' },
    })
  })

  it('gives the same answer whether or not Supabase accepted the address', async () => {
    const requestMagicLink = await load()
    signInWithOtp.mockResolvedValue({ error: { message: 'Signups not allowed for otp' } })
    expect(await requestMagicLink(idle, form('stranger@example.test'))).toEqual({ status: 'sent' })
  })

  it('refuses an origin that is not on the allowlist', async () => {
    const requestMagicLink = await load()
    requestHeaders.origin = 'https://evil.example'
    expect(await requestMagicLink(idle, form('ada@example.test'))).toEqual({
      status: 'unavailable',
    })
    expect(signInWithOtp).not.toHaveBeenCalled()
  })

  it('limits repeated requests for one address', async () => {
    const requestMagicLink = await load()
    for (let i = 0; i < 3; i++) await requestMagicLink(idle, form('ada@example.test'))
    expect(await requestMagicLink(idle, form('ADA@example.test'))).toEqual({ status: 'limited' })
    expect(signInWithOtp).toHaveBeenCalledTimes(3)
  })

  it('limits many addresses from one client', async () => {
    const requestMagicLink = await load()
    for (let i = 0; i < 10; i++) await requestMagicLink(idle, form(`user${i}@example.test`))
    expect(await requestMagicLink(idle, form('another@example.test'))).toEqual({
      status: 'limited',
    })
  })
})
