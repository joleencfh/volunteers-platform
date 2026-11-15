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
let isAdmin = false
vi.mock('@/lib/authz', () => ({
  requireUser: async () => {
    if (!signedIn) throw new Error('REDIRECT /login')
    return { id: 'member-1', displayName: 'Ada', isAdmin }
  },
}))

const GROUP = '8b1c2f3e-4d5a-4b6c-8d7e-9f0a1b2c3d4e'
const REQUEST = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'

const inserts = vi.fn()
const rpc = vi.fn()
let insertError: { code: string } | null = null
let rpcResult: { data: string | null; error: { code: string } | null } = {
  data: 'approved',
  error: null,
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      insert: async (row: Record<string, string>) => {
        inserts(row)
        return { error: insertError }
      },
    }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpc(name, args)
      return rpcResult
    },
  }),
}))

import { decideJoinRequest, requestToJoin } from '@/app/[lang]/groups/[slug]/actions'

const form = (values: Record<string, string>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

beforeEach(() => {
  vi.clearAllMocks()
  signedIn = true
  isAdmin = false
  insertError = null
  rpcResult = { data: 'approved', error: null }
})

describe('requestToJoin', () => {
  const idle = { status: 'idle' as const }

  it('requires a signed-in member and writes nothing without one', async () => {
    signedIn = false
    await expect(requestToJoin(idle, form({ groupId: GROUP }))).rejects.toThrow('REDIRECT')
    expect(inserts).not.toHaveBeenCalled()
  })

  it('refuses an id that is not a UUID', async () => {
    expect(await requestToJoin(idle, form({ groupId: 'x' }))).toEqual({ status: 'invalid' })
    expect(inserts).not.toHaveBeenCalled()
  })

  it('refuses an admin without writing', async () => {
    isAdmin = true
    expect(await requestToJoin(idle, form({ groupId: GROUP }))).toEqual({ status: 'notAllowed' })
    expect(inserts).not.toHaveBeenCalled()
  })

  it('records the request for the caller', async () => {
    expect(await requestToJoin(idle, form({ groupId: GROUP }))).toEqual({ status: 'requested' })
    expect(inserts).toHaveBeenCalledWith({ group_id: GROUP, user_id: 'member-1' })
  })

  it('treats a second pending request as requested, quietly', async () => {
    insertError = { code: '23505' }
    expect(await requestToJoin(idle, form({ groupId: GROUP }))).toEqual({ status: 'requested' })
  })

  it('reports a refusal by the policy (already a member, archived group)', async () => {
    insertError = { code: '42501' }
    expect(await requestToJoin(idle, form({ groupId: GROUP }))).toEqual({ status: 'notAllowed' })
  })

  it('reports any other failure as unavailable', async () => {
    insertError = { code: 'XX000' }
    expect(await requestToJoin(idle, form({ groupId: GROUP }))).toEqual({ status: 'unavailable' })
  })
})

describe('decideJoinRequest', () => {
  const idle = { status: 'idle' as const }

  it('requires a signed-in member and calls nothing without one', async () => {
    signedIn = false
    await expect(
      decideJoinRequest(idle, form({ requestId: REQUEST, approve: 'true' })),
    ).rejects.toThrow('REDIRECT')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses an id that is not a UUID or a decision that is not true or false', async () => {
    expect(await decideJoinRequest(idle, form({ requestId: 'x', approve: 'true' }))).toEqual({
      status: 'invalid',
    })
    expect(await decideJoinRequest(idle, form({ requestId: REQUEST, approve: 'maybe' }))).toEqual({
      status: 'invalid',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('approves through the database function', async () => {
    expect(await decideJoinRequest(idle, form({ requestId: REQUEST, approve: 'true' }))).toEqual({
      status: 'approved',
    })
    expect(rpc).toHaveBeenCalledWith('decide_join_request', { p_request: REQUEST, p_approve: true })
  })

  it('rejects through the database function', async () => {
    rpcResult = { data: 'rejected', error: null }
    expect(await decideJoinRequest(idle, form({ requestId: REQUEST, approve: 'false' }))).toEqual({
      status: 'rejected',
    })
    expect(rpc).toHaveBeenCalledWith('decide_join_request', {
      p_request: REQUEST,
      p_approve: false,
    })
  })

  it('maps "not found" and "not allowed" to the same state', async () => {
    for (const code of ['P0002', '42501']) {
      rpcResult = { data: null, error: { code } }
      expect(await decideJoinRequest(idle, form({ requestId: REQUEST, approve: 'true' }))).toEqual({
        status: 'notFound',
      })
    }
  })

  it('maps an already decided or archived request to a conflict', async () => {
    rpcResult = { data: null, error: { code: '55000' } }
    expect(await decideJoinRequest(idle, form({ requestId: REQUEST, approve: 'true' }))).toEqual({
      status: 'conflict',
    })
  })

  it('reports any other failure as unavailable', async () => {
    rpcResult = { data: null, error: { code: 'XX000' } }
    expect(await decideJoinRequest(idle, form({ requestId: REQUEST, approve: 'true' }))).toEqual({
      status: 'unavailable',
    })
  })
})
