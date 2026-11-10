import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

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

type Step = { id: string; confirmed_by: 'self' | 'auto' | 'admin'; active: boolean }
let steps: Record<string, Step>
let insertError: { code: string } | null
const insert = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) =>
      table === 'onboarding_steps'
        ? {
            select: () => ({
              eq: (_column: string, key: string) => ({
                maybeSingle: async () => ({ data: steps[key] ?? null, error: null }),
              }),
            }),
          }
        : {
            insert: async (row: unknown) => {
              insert(row)
              return { error: insertError }
            },
          },
  }),
}))

import { completeOnboardingStep } from '@/app/[lang]/home/actions'

function form(step: string | null) {
  const data = new FormData()
  if (step !== null) data.set('step', step)
  return data
}
const idle = { status: 'idle' } as const

beforeEach(() => {
  signedIn = true
  insertError = null
  insert.mockClear()
  steps = {
    self_step: { id: 'step-1', confirmed_by: 'self', active: true },
    admin_step: { id: 'step-2', confirmed_by: 'admin', active: true },
    auto_step: { id: 'step-3', confirmed_by: 'auto', active: true },
    old_step: { id: 'step-4', confirmed_by: 'self', active: false },
  }
})

describe('completeOnboardingStep', () => {
  it('requires a signed-in member before anything else', async () => {
    signedIn = false
    await expect(completeOnboardingStep(idle, form('self_step'))).rejects.toBeInstanceOf(Redirect)
    expect(insert).not.toHaveBeenCalled()
  })

  it('records a self step for the member, as their own confirmation', async () => {
    expect(await completeOnboardingStep(idle, form('self_step'))).toEqual({ status: 'done' })
    expect(insert).toHaveBeenCalledWith({
      user_id: 'member-1',
      step_id: 'step-1',
      completed_by: 'member-1',
    })
  })

  it('refuses admin and auto steps without writing', async () => {
    expect(await completeOnboardingStep(idle, form('admin_step'))).toEqual({ status: 'refused' })
    expect(await completeOnboardingStep(idle, form('auto_step'))).toEqual({ status: 'refused' })
    expect(insert).not.toHaveBeenCalled()
  })

  it('rejects a missing, unknown or inactive step', async () => {
    for (const value of [null, '', 'nope', 'old_step', 'x'.repeat(65)]) {
      expect(await completeOnboardingStep(idle, form(value))).toEqual({ status: 'invalid' })
    }
    expect(insert).not.toHaveBeenCalled()
  })

  it('treats completing a step twice as success', async () => {
    insertError = { code: '23505' }
    expect(await completeOnboardingStep(idle, form('self_step'))).toEqual({ status: 'done' })
  })

  it('reports other database errors as unavailable', async () => {
    insertError = { code: '42501' }
    expect(await completeOnboardingStep(idle, form('self_step'))).toEqual({
      status: 'unavailable',
    })
  })
})
