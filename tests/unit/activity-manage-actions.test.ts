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
let level = 'fresh'
let isAdmin = false
const order: string[] = []
vi.mock('@/lib/authz', () => ({
  requireUser: async () => {
    order.push('requireUser')
    if (!signedIn) throw new Error('REDIRECT /login')
    return { id: 'member-1', level, isAdmin }
  },
}))
vi.mock('@/lib/authz/wg', () => ({
  requireWgMember: async () => {
    order.push('requireWgMember')
    if (!allowed) throw new Error('NOT_FOUND')
    return { member: { id: 'member-1', level, isAdmin }, membership: null }
  },
}))

type Row = { id: string; type: string; is_general: boolean; archived_at: string | null }
const ACTIVITY = 'a1b2c3d4-0000-4000-8000-000000000001'
const GROUP = '8b1c2f3e-4d5a-4b6c-8d7e-9f0a1b2c3d4e'
const LEAD = 'c1b2c3d4-0000-4000-8000-0000000000aa'

let activity: Row | null
let updateResult: { data: { id: string } | null; error: { code: string } | null }
let rpcResult: { error: { code: string } | null }
const update = vi.fn()
const rpc = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      select: () => {
        order.push('select')
        const chain = {
          eq: () => chain,
          maybeSingle: async () => ({ data: activity }),
        }
        return chain
      },
      update: (payload: unknown) => {
        order.push('update')
        update(payload)
        const chain = {
          eq: () => chain,
          select: () => chain,
          maybeSingle: async () => updateResult,
        }
        return chain
      },
    }),
    rpc: async (name: string, args: unknown) => {
      order.push(`rpc:${name}`)
      rpc(name, args)
      return rpcResult
    },
  }),
}))

import {
  archiveActivity,
  joinActivity,
  leaveActivity,
  restoreActivity,
  setActivityLead,
  updateActivity,
} from '@/app/[lang]/groups/[slug]/activities/actions'

const idle = { status: 'idle' as const }
const form = (values: Record<string, string>) => {
  const data = new FormData()
  data.set('groupId', GROUP)
  data.set('slug', 'lobbying')
  data.set('activityId', ACTIVITY)
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}
const edit = (extra: Record<string, string> = {}) =>
  form({
    title: 'New title',
    status: 'active',
    keyActivity: 'on',
    'details.message': 'Please support the treaty.',
    ...extra,
  })

beforeEach(() => {
  vi.clearAllMocks()
  order.length = 0
  signedIn = true
  allowed = true
  level = 'fresh'
  isAdmin = false
  activity = { id: ACTIVITY, type: 'campaign', is_general: false, archived_at: null }
  updateResult = { data: { id: ACTIVITY }, error: null }
  rpcResult = { error: null }
})

describe('authorisation comes first in every action', () => {
  const actions = {
    updateActivity: () => updateActivity(idle, edit()),
    archiveActivity: () => archiveActivity(idle, form({})),
    restoreActivity: () => restoreActivity(idle, form({})),
    joinActivity: () => joinActivity(idle, form({ role: 'participant' })),
    leaveActivity: () => leaveActivity(idle, form({})),
    setActivityLead: () => setActivityLead(idle, form({ userId: LEAD })),
  }
  for (const [name, run] of Object.entries(actions)) {
    it(`${name}: requireUser, then the group check, before anything is read or written`, async () => {
      await run()
      expect(order.slice(0, 2)).toEqual(['requireUser', 'requireWgMember'])
    })

    it(`${name}: sends a signed-out visitor to the login page and writes nothing`, async () => {
      signedIn = false
      await expect(run()).rejects.toThrow('REDIRECT /login')
      expect(update).not.toHaveBeenCalled()
      expect(rpc).not.toHaveBeenCalled()
    })

    it(`${name}: a person outside the group gets not-found and writes nothing`, async () => {
      allowed = false
      await expect(run()).rejects.toThrow('NOT_FOUND')
      expect(update).not.toHaveBeenCalled()
      expect(rpc).not.toHaveBeenCalled()
    })

    it(`${name}: an activity the person cannot see is not found`, async () => {
      activity = null
      expect(await run()).toEqual({ status: 'notFound' })
      expect(update).not.toHaveBeenCalled()
      expect(rpc).not.toHaveBeenCalled()
    })
  }
})

describe('updateActivity', () => {
  it('updates the common fields and the details, never the type', async () => {
    expect(await updateActivity(idle, edit())).toEqual({ status: 'done' })
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'New title',
        status: 'active',
        key_activity: true,
        details: { message: 'Please support the treaty.' },
      }),
    )
    expect(update.mock.calls[0]?.[0]).not.toHaveProperty('type')
  })

  it('refuses the General activity and archived activities', async () => {
    activity = { id: ACTIVITY, type: 'general', is_general: true, archived_at: null }
    expect(await updateActivity(idle, edit())).toEqual({ status: 'general' })
    activity = { id: ACTIVITY, type: 'campaign', is_general: false, archived_at: 'x' }
    expect(await updateActivity(idle, edit())).toEqual({ status: 'conflict' })
    expect(update).not.toHaveBeenCalled()
  })

  it('refuses invalid common fields and invalid details with typed states', async () => {
    expect(await updateActivity(idle, edit({ title: '' }))).toEqual({ status: 'invalid' })
    expect(await updateActivity(idle, edit({ 'details.message': '' }))).toEqual({
      status: 'invalidDetails',
    })
    expect(update).not.toHaveBeenCalled()
  })

  it('reports a row hidden by row-level security as not allowed', async () => {
    updateResult = { data: null, error: null }
    expect(await updateActivity(idle, edit())).toEqual({ status: 'notAllowed' })
  })

  it('maps database errors to typed states', async () => {
    updateResult = { data: null, error: { code: '42501' } }
    expect(await updateActivity(idle, edit())).toEqual({ status: 'notAllowed' })
    updateResult = { data: null, error: { code: '23514' } }
    expect(await updateActivity(idle, edit())).toEqual({ status: 'invalid' })
    updateResult = { data: null, error: { code: 'XX000' } }
    expect(await updateActivity(idle, edit())).toEqual({ status: 'unavailable' })
  })
})

describe('archiveActivity and restoreActivity', () => {
  it('archives by setting archived_at', async () => {
    expect(await archiveActivity(idle, form({}))).toEqual({ status: 'done' })
    expect(update).toHaveBeenCalledWith({ archived_at: expect.any(String) })
  })

  it('restores by clearing archived_at', async () => {
    activity = { id: ACTIVITY, type: 'campaign', is_general: false, archived_at: 'x' }
    expect(await restoreActivity(idle, form({}))).toEqual({ status: 'done' })
    expect(update).toHaveBeenCalledWith({ archived_at: null })
  })

  it('does nothing when the activity is already in the wanted state', async () => {
    expect(await restoreActivity(idle, form({}))).toEqual({ status: 'done' })
    expect(update).not.toHaveBeenCalled()
  })

  it('refuses the General activity', async () => {
    activity = { id: ACTIVITY, type: 'general', is_general: true, archived_at: null }
    expect(await archiveActivity(idle, form({}))).toEqual({ status: 'general' })
    expect(update).not.toHaveBeenCalled()
  })

  it('a creator who may not archive (row hidden) gets not allowed', async () => {
    updateResult = { data: null, error: { code: '42501' } }
    expect(await archiveActivity(idle, form({}))).toEqual({ status: 'notAllowed' })
  })
})

describe('joinActivity', () => {
  it('lets a fresh member join as participant or observer', async () => {
    expect(await joinActivity(idle, form({ role: 'participant' }))).toEqual({ status: 'done' })
    expect(rpc).toHaveBeenCalledWith('join_activity', {
      p_activity: ACTIVITY,
      p_role: 'participant',
    })
    expect(await joinActivity(idle, form({ role: 'observer' }))).toEqual({ status: 'done' })
  })

  it('refuses a new volunteer joining as participant, without calling the database', async () => {
    level = 'new'
    expect(await joinActivity(idle, form({ role: 'participant' }))).toEqual({
      status: 'notAllowed',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('lets a new volunteer join as observer', async () => {
    level = 'new'
    expect(await joinActivity(idle, form({ role: 'observer' }))).toEqual({ status: 'done' })
    expect(rpc).toHaveBeenCalledWith('join_activity', { p_activity: ACTIVITY, p_role: 'observer' })
  })

  it('refuses an unknown role', async () => {
    expect(await joinActivity(idle, form({ role: 'boss' }))).toEqual({ status: 'invalid' })
  })

  it('maps an archived activity to a conflict and a database refusal to not allowed', async () => {
    rpcResult = { error: { code: '55000' } }
    expect(await joinActivity(idle, form({ role: 'participant' }))).toEqual({ status: 'conflict' })
    rpcResult = { error: { code: '42501' } }
    expect(await joinActivity(idle, form({ role: 'participant' }))).toEqual({
      status: 'notAllowed',
    })
  })
})

describe('leaveActivity', () => {
  it('leaves through the database function', async () => {
    expect(await leaveActivity(idle, form({}))).toEqual({ status: 'done' })
    expect(rpc).toHaveBeenCalledWith('leave_activity', { p_activity: ACTIVITY })
  })

  it('maps a database error', async () => {
    rpcResult = { error: { code: '42501' } }
    expect(await leaveActivity(idle, form({}))).toEqual({ status: 'notAllowed' })
  })
})

describe('setActivityLead', () => {
  it('sets the lead through the database function, which checks the participant role', async () => {
    expect(await setActivityLead(idle, form({ userId: LEAD }))).toEqual({ status: 'done' })
    expect(rpc).toHaveBeenCalledWith('set_activity_lead', { p_activity: ACTIVITY, p_user: LEAD })
  })

  it('refuses a lead who is not a participant (database refusal) as invalid', async () => {
    rpcResult = { error: { code: '22023' } }
    expect(await setActivityLead(idle, form({ userId: LEAD }))).toEqual({ status: 'invalid' })
  })

  it('refuses a person who may not edit', async () => {
    rpcResult = { error: { code: '42501' } }
    expect(await setActivityLead(idle, form({ userId: LEAD }))).toEqual({ status: 'notAllowed' })
  })

  it('rejects a malformed user id and the General activity', async () => {
    expect(await setActivityLead(idle, form({ userId: 'nope' }))).toEqual({ status: 'invalid' })
    activity = { id: ACTIVITY, type: 'general', is_general: true, archived_at: null }
    expect(await setActivityLead(idle, form({ userId: LEAD }))).toEqual({ status: 'general' })
    expect(rpc).not.toHaveBeenCalled()
  })
})
