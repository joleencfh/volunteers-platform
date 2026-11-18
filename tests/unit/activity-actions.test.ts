import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`)
  },
}))

let signedIn = true
let allowed = true
const order: string[] = []
const requireWgMember = vi.fn()
vi.mock('@/lib/authz', () => ({
  requireUser: async () => {
    order.push('requireUser')
    if (!signedIn) throw new Error('REDIRECT /login')
    return { id: 'member-1' }
  },
}))
vi.mock('@/lib/authz/wg', () => ({
  requireWgMember: async (groupId: string, minLevel?: string) => {
    order.push('requireWgMember')
    requireWgMember(groupId, minLevel)
    if (!allowed) throw new Error('NOT_FOUND')
    return { member: { id: 'member-1' }, membership: null }
  },
}))

const insert = vi.fn()
const rpc = vi.fn()
let insertResult: { data: { id: string } | null; error: { code: string } | null } = {
  data: { id: 'a1b2c3d4-0000-4000-8000-000000000001' },
  error: null,
}
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => ({
      insert: (payload: unknown) => {
        order.push('insert')
        insert(table, payload)
        return { select: () => ({ single: async () => insertResult }) }
      },
    }),
    rpc: async (name: string, args: unknown) => {
      order.push(`rpc:${name}`)
      rpc(name, args)
      return { data: null, error: null }
    },
  }),
}))

import { createActivity } from '@/app/[lang]/groups/[slug]/activities/actions'

const GROUP = '8b1c2f3e-4d5a-4b6c-8d7e-9f0a1b2c3d4e'
const idle = { status: 'idle' as const }

const form = (values: Record<string, string>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}
const campaign = (extra: Record<string, string> = {}) =>
  form({
    groupId: GROUP,
    slug: 'lobbying',
    type: 'campaign',
    title: 'Letter to MPs',
    status: 'planned',
    'details.message': 'Please support the treaty.',
    ...extra,
  })

beforeEach(() => {
  vi.clearAllMocks()
  order.length = 0
  signedIn = true
  allowed = true
  insertResult = { data: { id: 'a1b2c3d4-0000-4000-8000-000000000001' }, error: null }
})

describe('createActivity', () => {
  it('authorises first: requireUser, then the group check at fresh level, before any write', async () => {
    await expect(createActivity(idle, campaign())).rejects.toThrow('REDIRECT')
    expect(order.slice(0, 2)).toEqual(['requireUser', 'requireWgMember'])
    expect(requireWgMember).toHaveBeenCalledWith(GROUP, 'fresh')
    expect(order.indexOf('insert')).toBeGreaterThan(order.indexOf('requireWgMember'))
  })

  it('sends a signed-out visitor to the login page and writes nothing', async () => {
    signedIn = false
    await expect(createActivity(idle, campaign())).rejects.toThrow('REDIRECT /login')
    expect(insert).not.toHaveBeenCalled()
  })

  it('refuses a new volunteer (the group check fails) and writes nothing', async () => {
    allowed = false
    await expect(createActivity(idle, campaign())).rejects.toThrow('NOT_FOUND')
    expect(insert).not.toHaveBeenCalled()
  })

  it('inserts with the creator, joins as participant and redirects to the detail page', async () => {
    await expect(createActivity(idle, campaign({ keyActivity: 'on' }))).rejects.toThrow(
      'REDIRECT /groups/lobbying/activities/a1b2c3d4-0000-4000-8000-000000000001',
    )
    expect(insert).toHaveBeenCalledWith(
      'activities',
      expect.objectContaining({
        group_id: GROUP,
        type: 'campaign',
        title: 'Letter to MPs',
        created_by: 'member-1',
        key_activity: true,
        details: { message: 'Please support the treaty.' },
      }),
    )
    expect(rpc).toHaveBeenCalledWith('join_activity', {
      p_activity: 'a1b2c3d4-0000-4000-8000-000000000001',
      p_role: 'participant',
    })
  })

  it('refuses the General type and unknown types', async () => {
    expect(await createActivity(idle, campaign({ type: 'general' }))).toEqual({
      status: 'invalidType',
    })
    expect(await createActivity(idle, campaign({ type: 'nope' }))).toEqual({
      status: 'invalidType',
    })
    expect(insert).not.toHaveBeenCalled()
  })

  it('refuses invalid details with a typed state', async () => {
    expect(await createActivity(idle, campaign({ 'details.message': '' }))).toEqual({
      status: 'invalidDetails',
    })
    expect(
      await createActivity(
        idle,
        form({
          groupId: GROUP,
          slug: 'lobbying',
          type: 'meeting',
          title: 'Sync',
          'details.startsAt': '2026-07-15T20:30',
          'details.meetingUrl': 'http://not-https.test',
        }),
      ),
    ).toEqual({ status: 'invalidDetails' })
    expect(insert).not.toHaveBeenCalled()
  })

  it('refuses invalid common fields and bad ids', async () => {
    expect(await createActivity(idle, campaign({ title: '' }))).toEqual({ status: 'invalid' })
    expect(await createActivity(idle, campaign({ groupId: 'not-a-uuid' }))).toEqual({
      status: 'invalid',
    })
    expect(await createActivity(idle, campaign({ slug: '../x' }))).toEqual({ status: 'invalid' })
    expect(insert).not.toHaveBeenCalled()
  })

  it('maps database refusals to typed states', async () => {
    insertResult = { data: null, error: { code: '42501' } }
    expect(await createActivity(idle, campaign())).toEqual({ status: 'notAllowed' })
    insertResult = { data: null, error: { code: '23514' } }
    expect(await createActivity(idle, campaign())).toEqual({ status: 'invalid' })
    insertResult = { data: null, error: { code: 'XX000' } }
    expect(await createActivity(idle, campaign())).toEqual({ status: 'unavailable' })
    expect(rpc).not.toHaveBeenCalled()
  })
})
