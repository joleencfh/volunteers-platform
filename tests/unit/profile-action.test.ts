import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

class Redirect extends Error {
  constructor(public path: string) {
    super('redirect')
  }
}
let signedIn = true
vi.mock('@/lib/authz', () => ({
  requireUser: async () => {
    if (!signedIn) throw new Redirect('/login')
    return { id: 'member-1' }
  },
}))

const rpc = vi.fn()
const upsert = vi.fn()
const deleted = vi.fn()
let failRpc = false
let failUpsert = false
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    rpc: async (name: string, args: unknown) => {
      rpc(name, args)
      return { error: failRpc ? { code: 'x' } : null }
    },
    from: (table: string) => ({
      upsert: async (rows: unknown) => {
        upsert(table, rows)
        return { error: failUpsert ? { code: 'x' } : null }
      },
      delete: () => ({
        eq: (_column: string, userId: string) => ({
          in: async (_column2: string, fields: string[]) => {
            deleted(table, userId, fields)
            return { error: null }
          },
        }),
      }),
    }),
  }),
}))

import { saveProfile } from '@/app/[lang]/profile/actions'

function form(values: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

const valid = {
  displayName: ' Ada ',
  city: 'Test City',
  bio: '',
  linkedinUrl: 'https://www.linkedin.com/in/example',
  aiSafetyKnowledge: 'basic',
  aiRisks: '',
  'visibility.city': 'members',
}

describe('saveProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    signedIn = true
    failRpc = false
    failUpsert = false
  })

  it('sends a signed-out caller to the login page before doing anything', async () => {
    signedIn = false
    await expect(saveProfile({ status: 'idle' }, form(valid))).rejects.toThrow('redirect')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses invalid input without writing, naming the field', async () => {
    const state = await saveProfile(
      { status: 'idle' },
      form({ ...valid, linkedinUrl: 'http://example.test' }),
    )
    expect(state).toEqual({ status: 'invalid', errors: { linkedinUrl: 'invalidUrl' } })
    expect(rpc).not.toHaveBeenCalled()
    expect(upsert).not.toHaveBeenCalled()
  })

  it('saves the fields, stores non-default choices and clears default ones', async () => {
    const state = await saveProfile({ status: 'idle' }, form(valid))
    expect(state).toEqual({ status: 'saved' })
    expect(rpc).toHaveBeenCalledWith('update_own_profile', {
      display_name: 'Ada',
      city: 'Test City',
      bio: '',
      linkedin_url: 'https://www.linkedin.com/in/example',
      ai_safety_knowledge: 'basic',
      ai_risks: '',
    })
    expect(upsert).toHaveBeenCalledWith('profile_visibility', [
      { user_id: 'member-1', field: 'city', tier: 'members' },
    ])
    expect(deleted).toHaveBeenCalledWith('profile_visibility', 'member-1', [
      'bio',
      'linkedin_url',
      'ai_safety_knowledge',
      'ai_risks',
    ])
  })

  it('reports unavailable when the database refuses', async () => {
    failRpc = true
    expect(await saveProfile({ status: 'idle' }, form(valid))).toEqual({ status: 'unavailable' })
    failRpc = false
    failUpsert = true
    expect(await saveProfile({ status: 'idle' }, form(valid))).toEqual({ status: 'unavailable' })
  })
})
