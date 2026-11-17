import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

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

const upserts = vi.fn()
let targetRow: { user_id: string } | null = { user_id: 'target' }
let lookupError: { code: string } | null = null
let upsertError: { code: string } | null = null

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      if (table === 'wg_members') {
        const query = {
          select: () => query,
          eq: () => query,
          maybeSingle: async () => ({ data: targetRow, error: lookupError }),
        }
        return query
      }
      return {
        upsert: async (row: Record<string, string>, options: Record<string, string>) => {
          order.push('upsert')
          upserts(row, options)
          return { error: upsertError }
        },
      }
    },
  }),
}))

import { assignLead } from '@/app/[lang]/groups/[slug]/actions'
import { currentWeekStart } from '@/lib/domain/leads'

const GROUP = '8b1c2f3e-4d5a-4b6c-8d7e-9f0a1b2c3d4e'
const TARGET = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
const idle = { status: 'idle' as const }

const form = (values: Record<string, string>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}
const thisWeek = () => currentWeekStart(new Date())
const input = (weekStart: string) => form({ groupId: GROUP, userId: TARGET, weekStart })

beforeEach(() => {
  vi.clearAllMocks()
  order.length = 0
  signedIn = true
  allowed = true
  targetRow = { user_id: TARGET }
  lookupError = null
  upsertError = null
})

describe('assignLead', () => {
  it('requires a signed-in member before anything else', async () => {
    signedIn = false
    await expect(assignLead(idle, input(thisWeek()))).rejects.toThrow('REDIRECT')
    expect(requireWgMember).not.toHaveBeenCalled()
    expect(upserts).not.toHaveBeenCalled()
  })

  it('refuses malformed input without checking the group or writing', async () => {
    for (const values of [
      { groupId: 'x', userId: TARGET, weekStart: thisWeek() },
      { groupId: GROUP, userId: 'x', weekStart: thisWeek() },
      { groupId: GROUP, userId: TARGET, weekStart: 'next week' },
    ]) {
      expect(await assignLead(idle, form(values))).toEqual({ status: 'invalid' })
    }
    expect(upserts).not.toHaveBeenCalled()
  })

  it('asks for an experienced member of the group, and writes nothing when refused', async () => {
    allowed = false
    await expect(assignLead(idle, input(thisWeek()))).rejects.toThrow('NOT_FOUND')
    expect(requireWgMember).toHaveBeenCalledWith(GROUP, 'experienced')
    expect(upserts).not.toHaveBeenCalled()
    expect(order.slice(0, 2)).toEqual(['requireUser', 'requireWgMember'])
  })

  it('refuses a past week with a typed state', async () => {
    const past = new Date(`${thisWeek()}T00:00:00Z`)
    past.setUTCDate(past.getUTCDate() - 7)
    expect(await assignLead(idle, input(past.toISOString().slice(0, 10)))).toEqual({
      status: 'pastWeek',
    })
    expect(upserts).not.toHaveBeenCalled()
  })

  it('refuses a date that is not a Monday', async () => {
    const tuesday = new Date(`${thisWeek()}T00:00:00Z`)
    tuesday.setUTCDate(tuesday.getUTCDate() + 8)
    expect(await assignLead(idle, input(tuesday.toISOString().slice(0, 10)))).toEqual({
      status: 'pastWeek',
    })
    expect(upserts).not.toHaveBeenCalled()
  })

  it('refuses a target who is not a member of the group', async () => {
    targetRow = null
    expect(await assignLead(idle, input(thisWeek()))).toEqual({ status: 'notMember' })
    expect(upserts).not.toHaveBeenCalled()
  })

  it('upserts the row for the group and week, assigned by the caller', async () => {
    expect(await assignLead(idle, input(thisWeek()))).toEqual({ status: 'assigned' })
    expect(upserts).toHaveBeenCalledTimes(1)
    const [row, options] = upserts.mock.calls[0] as [Record<string, string>, Record<string, string>]
    expect(row).toMatchObject({
      group_id: GROUP,
      week_start: thisWeek(),
      user_id: TARGET,
      assigned_by: 'member-1',
    })
    expect(options).toEqual({ onConflict: 'group_id,week_start' })
  })

  it('maps a policy refusal and any other failure to typed states', async () => {
    upsertError = { code: '42501' }
    expect(await assignLead(idle, input(thisWeek()))).toEqual({ status: 'notAllowed' })
    upsertError = { code: 'XX000' }
    expect(await assignLead(idle, input(thisWeek()))).toEqual({ status: 'unavailable' })
    upsertError = null
    lookupError = { code: 'XX000' }
    expect(await assignLead(idle, input(thisWeek()))).toEqual({ status: 'unavailable' })
  })
})
