import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`)
  },
}))
vi.mock('next/headers', () => ({ cookies: async () => ({ set: vi.fn(), delete: vi.fn() }) }))

let signedIn = true
let admin: { id: string } | 'not-admin' = { id: 'admin-1' }
vi.mock('@/lib/authz', () => ({
  requireUser: async () => {
    if (!signedIn) throw new Error('REDIRECT /login')
    return { id: 'member-1', displayName: 'Ada' }
  },
  requireAdmin: async () => {
    if (admin === 'not-admin') throw new Error('NOT_FOUND')
    return admin
  },
}))

const recordAudit = vi.fn()
vi.mock('@/lib/audit', () => ({ recordAudit: (...args: unknown[]) => recordAudit(...args) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ service: true }) }))

const sendDataRequestEmail = vi.fn(async (...args: unknown[]) => void args)
vi.mock('@/lib/email/notify', () => ({
  sendDataRequestEmail: (...args: unknown[]) => sendDataRequestEmail(...args),
}))

type Row = { id: string; kind: 'export' | 'deletion'; user_id: string; status: 'open' | 'done' }
const REQUEST = '8b1c2f3e-4d5a-4b6c-8d7e-9f0a1b2c3d4e'
let rows: Row[]
const inserts = vi.fn()
let insertError: { code: string } | null = null

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      insert: async (row: Record<string, string>) => {
        inserts(row)
        return { error: insertError }
      },
      update: () => ({
        eq: (_a: string, id: string) => ({
          eq: (_b: string, status: string) => ({
            select: async () => {
              const hit = rows.filter((row) => row.id === id && row.status === status)
              for (const row of hit) row.status = 'done'
              return { data: hit, error: null }
            },
          }),
        }),
      }),
      select: () => ({
        eq: (_a: string, id: string) => ({
          maybeSingle: async () => ({
            data: rows.find((row) => row.id === id) ?? null,
            error: null,
          }),
        }),
      }),
    }),
  }),
}))

import { markRequestHandled } from '@/app/[lang]/admin/data-requests/actions'
import { requestData } from '@/app/[lang]/settings/actions'

const form = (values: Record<string, string>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

beforeEach(() => {
  vi.clearAllMocks()
  signedIn = true
  admin = { id: 'admin-1' }
  insertError = null
  rows = [{ id: REQUEST, kind: 'export', user_id: 'member-1', status: 'open' }]
})

describe('requestData', () => {
  const idle = { status: 'idle' as const }

  it('requires a signed-in member and writes nothing without one', async () => {
    signedIn = false
    await expect(requestData(idle, form({ kind: 'export' }))).rejects.toThrow('REDIRECT')
    expect(inserts).not.toHaveBeenCalled()
  })

  it('refuses a kind that is not export or deletion', async () => {
    expect(await requestData(idle, form({ kind: 'everything' }))).toEqual({ status: 'invalid' })
    expect(inserts).not.toHaveBeenCalled()
  })

  it('records the request for the caller and tells the admins', async () => {
    expect(await requestData(idle, form({ kind: 'deletion' }))).toEqual({ status: 'recorded' })
    expect(inserts).toHaveBeenCalledWith({ user_id: 'member-1', kind: 'deletion' })
    expect(sendDataRequestEmail).toHaveBeenCalledWith('deletion', 'Ada')
  })

  it('treats a second open request as recorded, without a second email', async () => {
    insertError = { code: '23505' }
    expect(await requestData(idle, form({ kind: 'export' }))).toEqual({ status: 'recorded' })
    expect(sendDataRequestEmail).not.toHaveBeenCalled()
  })

  it('reports a failed write and sends no email', async () => {
    insertError = { code: '42501' }
    expect(await requestData(idle, form({ kind: 'export' }))).toEqual({ status: 'unavailable' })
    expect(sendDataRequestEmail).not.toHaveBeenCalled()
  })
})

describe('markRequestHandled', () => {
  const idle = { status: 'idle' as const }

  it('is refused for a non-admin and changes and audits nothing', async () => {
    admin = 'not-admin'
    await expect(markRequestHandled(idle, form({ requestId: REQUEST }))).rejects.toThrow(
      'NOT_FOUND',
    )
    expect(rows[0].status).toBe('open')
    expect(recordAudit).not.toHaveBeenCalled()
  })

  it('refuses an id that is not a UUID', async () => {
    expect(await markRequestHandled(idle, form({ requestId: 'x' }))).toEqual({
      status: 'invalid',
    })
    expect(recordAudit).not.toHaveBeenCalled()
  })

  it('marks an open request done and writes one audit entry with ids and kind only', async () => {
    expect(await markRequestHandled(idle, form({ requestId: REQUEST }))).toEqual({
      status: 'done',
      changed: true,
    })
    expect(rows[0].status).toBe('done')
    expect(recordAudit).toHaveBeenCalledTimes(1)
    expect(recordAudit).toHaveBeenCalledWith(
      { service: true },
      {
        actorId: 'admin-1',
        action: 'data_request.handled',
        entityType: 'data_request',
        entityId: REQUEST,
        details: { kind: 'export', userId: 'member-1' },
      },
    )
  })

  it('writes no audit entry when the request was already handled', async () => {
    rows[0].status = 'done'
    expect(await markRequestHandled(idle, form({ requestId: REQUEST }))).toEqual({
      status: 'done',
      changed: false,
    })
    expect(recordAudit).not.toHaveBeenCalled()
  })

  it('reports a request that does not exist', async () => {
    rows = []
    expect(await markRequestHandled(idle, form({ requestId: REQUEST }))).toEqual({
      status: 'notFound',
    })
    expect(recordAudit).not.toHaveBeenCalled()
  })
})
