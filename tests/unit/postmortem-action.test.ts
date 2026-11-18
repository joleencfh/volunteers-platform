import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

let signedIn = true
let allowed = true
const order: string[] = []
vi.mock('@/lib/authz', () => ({
  requireUser: async () => {
    order.push('requireUser')
    if (!signedIn) throw new Error('REDIRECT /login')
    return { id: 'member-1', level: 'fresh', isAdmin: false }
  },
}))
vi.mock('@/lib/authz/wg', () => ({
  requireWgMember: async () => {
    order.push('requireWgMember')
    if (!allowed) throw new Error('NOT_FOUND')
    return { member: { id: 'member-1', level: 'fresh', isAdmin: false }, membership: null }
  },
}))

let rpcResult: { error: { code: string } | null }
const rpc = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    rpc: async (name: string, args: unknown) => {
      order.push(`rpc:${name}`)
      rpc(name, args)
      return rpcResult
    },
  }),
}))

import { savePostmortem } from '@/app/[lang]/groups/[slug]/activities/postmortem-actions'

const ACTIVITY = 'a1b2c3d4-0000-4000-8000-000000000001'
const GROUP = '8b1c2f3e-4d5a-4b6c-8d7e-9f0a1b2c3d4e'
const idle = { status: 'idle' as const }
const form = (values: Record<string, string> = {}) => {
  const data = new FormData()
  data.set('groupId', GROUP)
  data.set('slug', 'lobbying')
  data.set('activityId', ACTIVITY)
  data.set('wentWell', '  Good turnout ')
  data.set('improvements', '')
  data.set('learnings', 'Start earlier')
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

beforeEach(() => {
  vi.clearAllMocks()
  order.length = 0
  signedIn = true
  allowed = true
  rpcResult = { error: null }
})

describe('savePostmortem', () => {
  it('checks sign-in, then the group, before the database is touched', async () => {
    await savePostmortem(idle, form())
    expect(order).toEqual(['requireUser', 'requireWgMember', 'rpc:save_postmortem'])
  })

  it('sends a signed-out visitor to the login page and writes nothing', async () => {
    signedIn = false
    await expect(savePostmortem(idle, form())).rejects.toThrow('REDIRECT /login')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('gives a person outside the group not-found and writes nothing', async () => {
    allowed = false
    await expect(savePostmortem(idle, form())).rejects.toThrow('NOT_FOUND')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('saves trimmed texts, blank as null', async () => {
    expect(await savePostmortem(idle, form())).toEqual({ status: 'done' })
    expect(rpc).toHaveBeenCalledWith('save_postmortem', {
      p_activity: ACTIVITY,
      p_went_well: 'Good turnout',
      p_improvements: null,
      p_learnings: 'Start earlier',
    })
  })

  it('refuses a bad target or too long a text without calling the database', async () => {
    expect(await savePostmortem(idle, form({ activityId: 'nope' }))).toEqual({ status: 'invalid' })
    expect(await savePostmortem(idle, form({ wentWell: 'a'.repeat(4001) }))).toEqual({
      status: 'invalid',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('maps database errors to typed states', async () => {
    const cases: [string, string][] = [
      ['42501', 'notAllowed'],
      ['P0002', 'notFound'],
      ['55000', 'conflict'],
      ['23514', 'invalid'],
      ['XX000', 'unavailable'],
    ]
    for (const [code, status] of cases) {
      rpcResult = { error: { code } }
      expect(await savePostmortem(idle, form())).toEqual({ status })
    }
  })
})
