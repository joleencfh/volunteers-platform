import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT ${path}`)
  },
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
}))

type Level = 'new' | 'fresh' | 'experienced'
let member: { id: string; level: Level; isAdmin: boolean } | null
let membership: {
  group_id: string
  joined_at: string
  working_groups: { archived_at: string | null }
} | null

vi.mock('@/lib/authz/index', () => ({
  requireUser: async () => {
    if (!member) throw new Error('REDIRECT /login')
    return member
  },
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: membership, error: null }),
    }
    return { from: () => query }
  },
}))

import { requireWgMember } from '@/lib/authz/wg'

const GROUP = 'group-1'
const inGroup = (archived: string | null = null) => ({
  group_id: GROUP,
  joined_at: '2026-11-01T00:00:00Z',
  working_groups: { archived_at: archived },
})

beforeEach(() => {
  member = { id: 'u1', level: 'new', isAdmin: false }
  membership = inGroup()
})

describe('requireWgMember', () => {
  it('sends a signed-out visitor to the login page', async () => {
    member = null
    await expect(requireWgMember(GROUP)).rejects.toThrow('REDIRECT /login')
  })

  it('lets a member of any level through when no minimum level is set', async () => {
    const result = await requireWgMember(GROUP)
    expect(result.membership).toEqual({ groupId: GROUP, joinedAt: '2026-11-01T00:00:00Z' })
  })

  it('refuses a non-member with a 404', async () => {
    membership = null
    await expect(requireWgMember(GROUP)).rejects.toThrow('NOT_FOUND')
  })

  it('refuses a member of an archived group', async () => {
    membership = inGroup('2026-11-02T00:00:00Z')
    await expect(requireWgMember(GROUP)).rejects.toThrow('NOT_FOUND')
  })

  it('refuses a new member when fresh is the minimum, and lets fresh and experienced through', async () => {
    await expect(requireWgMember(GROUP, 'fresh')).rejects.toThrow('NOT_FOUND')
    for (const level of ['fresh', 'experienced'] as const) {
      member = { id: 'u1', level, isAdmin: false }
      await expect(requireWgMember(GROUP, 'fresh')).resolves.toBeDefined()
    }
  })

  it('lets only experienced members through when experienced is the minimum', async () => {
    member = { id: 'u1', level: 'fresh', isAdmin: false }
    await expect(requireWgMember(GROUP, 'experienced')).rejects.toThrow('NOT_FOUND')
    member = { id: 'u1', level: 'experienced', isAdmin: false }
    await expect(requireWgMember(GROUP, 'experienced')).resolves.toBeDefined()
  })

  it('lets an admin through for every group and level, with no membership', async () => {
    member = { id: 'a1', level: 'new', isAdmin: true }
    membership = null
    for (const min of [undefined, 'fresh', 'experienced'] as const) {
      const result = await requireWgMember(GROUP, min)
      expect(result.membership).toBeNull()
    }
  })

  it('does not let an experienced non-member through', async () => {
    member = { id: 'u1', level: 'experienced', isAdmin: false }
    membership = null
    await expect(requireWgMember(GROUP, 'experienced')).rejects.toThrow('NOT_FOUND')
  })
})
