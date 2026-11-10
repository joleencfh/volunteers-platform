import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const exchangeCodeForSession = vi.fn()
const signOut = vi.fn()
const findMember = vi.fn()
const eq = vi.fn()
const update = vi.fn(() => ({ eq }))
const from = vi.fn(() => ({ update }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession, signOut } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from }) }))
vi.mock('@/lib/authz/member', () => ({ findMember: (...args: unknown[]) => findMember(...args) }))

import { GET } from '@/app/auth/callback/route'

const call = (query: string) => GET(new Request(`http://localhost:3000/auth/callback${query}`))
const location = (response: Response) => response.headers.get('location')

beforeEach(() => {
  vi.clearAllMocks()
  exchangeCodeForSession.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
  findMember.mockResolvedValue({ id: 'u1', locale: 'en' })
  eq.mockResolvedValue({ error: null })
})

describe('GET /auth/callback', () => {
  it('signs an active member in, records the login and goes to /home', async () => {
    const response = await call('?code=abc')
    expect(location(response)).toBe('http://localhost:3000/home')
    expect(update).toHaveBeenCalledWith({ last_login_at: expect.any(String) })
    expect(eq).toHaveBeenCalledWith('id', 'u1')
    expect(signOut).not.toHaveBeenCalled()
  })

  it('mirrors the stored language into the preference cookie', async () => {
    findMember.mockResolvedValue({ id: 'u1', locale: 'it' })
    const response = await call('?code=abc')
    const cookie = response.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('pauseai_locale=it')
    expect(cookie.toLowerCase()).toContain('httponly')
  })

  it('follows a safe next path and ignores an unsafe one', async () => {
    expect(location(await call('?code=abc&next=/admin'))).toBe('http://localhost:3000/admin')
    expect(location(await call('?code=abc&next=//evil.example'))).toBe('http://localhost:3000/home')
  })

  it('signs out anyone who is not an active member and sends them back with the generic error', async () => {
    findMember.mockResolvedValue(null)
    const response = await call('?code=abc')
    expect(location(response)).toBe('http://localhost:3000/login?error=signin')
    expect(signOut).toHaveBeenCalledOnce()
    expect(update).not.toHaveBeenCalled()
  })

  it('answers a bad or missing code with the same generic error', async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { user: null }, error: { message: 'bad' } })
    expect(location(await call('?code=abc'))).toBe('http://localhost:3000/login?error=signin')
    expect(location(await call(''))).toBe('http://localhost:3000/login?error=signin')
  })
})
