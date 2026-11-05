import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

// redirect() throws in Next.js; mimic that so code after it does not run.
class Redirect extends Error {
  constructor(public path: string) {
    super('redirect')
  }
}
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Redirect(path)
  },
}))

let requestHeaders: Record<string, string> = {}
vi.mock('next/headers', () => ({ headers: async () => new Headers(requestHeaders) }))

const notifyAdmins = vi.fn()
vi.mock('@/lib/email/notify', () => ({ notifyAdminsOfApplication: () => notifyAdmins() }))

const insert = vi.fn()
const maybeSingle = vi.fn()
const ilike = vi.fn(() => ({ maybeSingle }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => (table === 'users' ? { select: () => ({ ilike }) } : { insert }),
  }),
}))

const fields = {
  displayName: 'Ada',
  firstName: 'Ada',
  lastName: 'Example',
  email: 'ada@example.test',
  city: 'Test City',
  motivation: '',
  heardVia: 'italian_website',
  heardOther: '',
  knowledge: 'basic',
  privacyAccepted: 'on',
  specialCategoryConsent: 'on',
}

const form = (overrides: Record<string, string | null> = {}) => {
  const data = new FormData()
  for (const [key, value] of Object.entries({ ...fields, ...overrides })) {
    if (value !== null) data.set(key, value)
  }
  return data
}

async function load() {
  vi.resetModules()
  return (await import('@/app/[lang]/apply/actions')).submitApplication
}

const idle = { status: 'idle' } as const

async function outcome(promise: Promise<unknown>) {
  try {
    return await promise
  } catch (error) {
    if (error instanceof Redirect) return `redirect:${error.path}`
    throw error
  }
}

beforeEach(() => {
  insert.mockReset()
  notifyAdmins.mockReset()
  insert.mockResolvedValue({ error: null })
  maybeSingle.mockReset()
  maybeSingle.mockResolvedValue({ data: null, error: null })
  ilike.mockClear()
  requestHeaders = { 'x-forwarded-for': '203.0.113.9' }
})

describe('submitApplication', () => {
  it('stores a valid application with consent timestamps and the notice version', async () => {
    const submit = await load()
    expect(await outcome(submit(idle, form()))).toBe('redirect:/apply/pending')
    expect(insert).toHaveBeenCalledOnce()
    const row = insert.mock.calls[0][0]
    expect(row).toMatchObject({
      display_name: 'Ada',
      real_name: 'Ada Example',
      email: 'ada@example.test',
      heard_via: 'italian_website',
      notice_version: 'placeholder',
    })
    expect(row.privacy_accepted_at).toBeTruthy()
    expect(row.special_category_consent_at).toBeTruthy()
    expect(notifyAdmins).toHaveBeenCalledOnce()
  })

  it('refuses an invalid form without touching the database, keeping the typed values', async () => {
    const submit = await load()
    const result = await submit(idle, form({ city: '', specialCategoryConsent: null }))
    expect(result).toMatchObject({
      status: 'invalid',
      errors: { city: 'required', specialCategoryConsent: 'required' },
      values: { displayName: 'Ada', email: 'ada@example.test' },
    })
    expect(insert).not.toHaveBeenCalled()
  })

  it('silently ignores a filled honeypot', async () => {
    const submit = await load()
    expect(await outcome(submit(idle, form({ company_website: 'https://spam.example' })))).toBe(
      'redirect:/apply/pending',
    )
    expect(insert).not.toHaveBeenCalled()
    expect(maybeSingle).not.toHaveBeenCalled()
  })

  it('treats a second pending application as a success without a second row', async () => {
    const submit = await load()
    insert.mockResolvedValue({ error: { code: '23505' } })
    expect(await outcome(submit(idle, form()))).toBe('redirect:/apply/pending')
    expect(notifyAdmins).not.toHaveBeenCalled()
  })

  it('gives an existing member the same answer and stores nothing', async () => {
    const submit = await load()
    maybeSingle.mockResolvedValue({ data: { id: 'member-id' }, error: null })
    expect(await outcome(submit(idle, form()))).toBe('redirect:/apply/pending')
    expect(insert).not.toHaveBeenCalled()
  })

  it('escapes wildcard characters when looking up a member', async () => {
    const submit = await load()
    await outcome(submit(idle, form({ email: 'a_b@example.test' })))
    expect(ilike).toHaveBeenCalledWith('email', 'a\\_b@example.test')
  })

  it('reports a database failure without revealing details', async () => {
    const submit = await load()
    insert.mockResolvedValue({ error: { code: 'XX000' } })
    expect(await submit(idle, form())).toEqual({ status: 'unavailable' })
  })

  it('limits repeated applications for one email', async () => {
    const submit = await load()
    for (let i = 0; i < 3; i++) await outcome(submit(idle, form()))
    expect(await submit(idle, form())).toEqual({ status: 'limited' })
    expect(insert).toHaveBeenCalledTimes(3)
  })
})
