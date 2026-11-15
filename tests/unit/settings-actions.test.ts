import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

class Redirect extends Error {
  constructor(readonly to: string) {
    super('NEXT_REDIRECT')
  }
}
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Redirect(to)
  },
}))

const set = vi.fn()
const del = vi.fn()
vi.mock('next/headers', () => ({ cookies: async () => ({ set, delete: del }) }))

let signedIn = true
vi.mock('@/lib/authz', () => ({
  requireUser: async () => {
    if (!signedIn) throw new Redirect('/login')
    return { id: 'u1' }
  },
}))

const rpc = vi.fn()
const signOutClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ rpc, auth: { signOut: signOutClient } }),
}))

import { setLocale, signOut } from '@/app/[lang]/settings/actions'

const form = (locale: string) => {
  const data = new FormData()
  data.set('locale', locale)
  return data
}
const idle = { status: 'idle' as const }

beforeEach(() => {
  vi.clearAllMocks()
  signedIn = true
  rpc.mockResolvedValue({ error: null })
})

describe('setLocale', () => {
  it('requires a signed-in member and writes nothing without one', async () => {
    signedIn = false
    await expect(setLocale(idle, form('it'))).rejects.toThrow(Redirect)
    expect(rpc).not.toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
  })

  it('saves a supported language and mirrors it into the cookie', async () => {
    expect(await setLocale(idle, form('it'))).toEqual({ status: 'saved' })
    expect(rpc).toHaveBeenCalledWith('set_own_locale', { new_locale: 'it' })
    expect(set).toHaveBeenCalledWith(
      'pauseai_locale',
      'it',
      expect.objectContaining({ httpOnly: true }),
    )
  })

  it('rejects an unsupported language before touching the database or the cookie', async () => {
    expect(await setLocale(idle, form('fr'))).toEqual({ status: 'invalid' })
    expect(rpc).not.toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
  })

  it('does not set the cookie when the database refuses', async () => {
    rpc.mockResolvedValue({ error: { message: 'no' } })
    expect(await setLocale(idle, form('it'))).toEqual({ status: 'unavailable' })
    expect(set).not.toHaveBeenCalled()
  })
})

describe('signOut', () => {
  it('ends the session, clears the cookie and goes to /login', async () => {
    await expect(signOut()).rejects.toMatchObject({ to: '/login' })
    expect(signOutClient).toHaveBeenCalledOnce()
    expect(del).toHaveBeenCalledWith('pauseai_locale')
  })

  it('does nothing for a visitor who is not signed in', async () => {
    signedIn = false
    await expect(signOut()).rejects.toMatchObject({ to: '/login' })
    expect(signOutClient).not.toHaveBeenCalled()
  })
})
