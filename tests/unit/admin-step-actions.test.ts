import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

class NotFound extends Error {}
let admin: { id: string } | 'not-admin' = { id: 'admin-1' }
vi.mock('@/lib/authz', () => ({
  requireAdmin: async () => {
    if (admin === 'not-admin') throw new NotFound('NOT_FOUND')
    return admin
  },
}))

const recordAudit = vi.fn()
vi.mock('@/lib/audit', () => ({ recordAudit: (...args: unknown[]) => recordAudit(...args) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ service: true }) }))

type Step = { id: string; confirmed_by: 'self' | 'auto' | 'admin'; active: boolean }
const MEMBER = '8b1c2f3e-4d5a-4b6c-8d7e-9f0a1b2c3d4e'
let steps: Record<string, Step>
let members: string[]
let rows: { user_id: string; step_id: string; completed_by: string }[]
const writes = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      if (table === 'onboarding_steps') {
        return {
          select: () => ({
            eq: (_c: string, key: string) => ({
              maybeSingle: async () => ({ data: steps[key] ?? null, error: null }),
            }),
          }),
        }
      }
      if (table === 'users') {
        return {
          select: () => ({
            eq: (_c: string, id: string) => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: members.includes(id) ? { id } : null,
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      return {
        insert: async (row: (typeof rows)[number]) => {
          writes('insert', row)
          if (rows.some((r) => r.user_id === row.user_id && r.step_id === row.step_id)) {
            return { error: { code: '23505' } }
          }
          rows.push(row)
          return { error: null }
        },
        delete: () => ({
          eq: (_a: string, userId: string) => ({
            eq: (_b: string, stepId: string) => ({
              select: async () => {
                writes('delete', { userId, stepId })
                const hit = rows.filter((r) => r.user_id === userId && r.step_id === stepId)
                rows = rows.filter((r) => !hit.includes(r))
                return { data: hit, error: null }
              },
            }),
          }),
        }),
      }
    },
  }),
}))

import { confirmAdminStep, unconfirmAdminStep } from '@/app/[lang]/admin/onboarding/actions'

beforeEach(() => {
  admin = { id: 'admin-1' }
  steps = {
    signal_group: { id: 'step-a', confirmed_by: 'admin', active: true },
    read_doc: { id: 'step-s', confirmed_by: 'self', active: true },
    old_admin: { id: 'step-o', confirmed_by: 'admin', active: false },
  }
  members = [MEMBER]
  rows = []
  writes.mockClear()
  recordAudit.mockClear()
})

describe.each([
  ['confirmAdminStep', confirmAdminStep],
  ['unconfirmAdminStep', unconfirmAdminStep],
])('%s authorisation', (_name, action) => {
  it('refuses a non-admin before reading or writing anything', async () => {
    admin = 'not-admin'
    await expect(action(MEMBER, 'signal_group')).rejects.toBeInstanceOf(NotFound)
    expect(writes).not.toHaveBeenCalled()
    expect(recordAudit).not.toHaveBeenCalled()
  })

  it('rejects a malformed user id or step key', async () => {
    expect(await action('not-a-uuid', 'signal_group')).toEqual({ status: 'invalid' })
    expect(await action(MEMBER, '')).toEqual({ status: 'invalid' })
    expect(writes).not.toHaveBeenCalled()
  })

  it('refuses self-confirmed steps and reports unknown or inactive steps and members', async () => {
    expect(await action(MEMBER, 'read_doc')).toEqual({ status: 'refused' })
    expect(await action(MEMBER, 'nope')).toEqual({ status: 'notFound' })
    expect(await action(MEMBER, 'old_admin')).toEqual({ status: 'notFound' })
    expect(await action('11111111-1111-4111-8111-111111111111', 'signal_group')).toEqual({
      status: 'notFound',
    })
    expect(writes).not.toHaveBeenCalled()
    expect(recordAudit).not.toHaveBeenCalled()
  })
})

describe('confirmAdminStep', () => {
  it('inserts the completion for the admin and audits it with ids only', async () => {
    expect(await confirmAdminStep(MEMBER, 'signal_group')).toEqual({
      status: 'done',
      changed: true,
    })
    expect(rows).toEqual([{ user_id: MEMBER, step_id: 'step-a', completed_by: 'admin-1' }])
    expect(recordAudit).toHaveBeenCalledTimes(1)
    expect(recordAudit).toHaveBeenCalledWith(expect.anything(), {
      actorId: 'admin-1',
      action: 'onboarding.step_confirmed',
      entityType: 'user_onboarding',
      entityId: MEMBER,
      details: { step: 'signal_group' },
    })
  })

  it('is idempotent: a second confirmation is a no-op without an audit entry', async () => {
    await confirmAdminStep(MEMBER, 'signal_group')
    recordAudit.mockClear()
    expect(await confirmAdminStep(MEMBER, 'signal_group')).toEqual({
      status: 'done',
      changed: false,
    })
    expect(rows).toHaveLength(1)
    expect(recordAudit).not.toHaveBeenCalled()
  })
})

describe('unconfirmAdminStep', () => {
  it('deletes the completion and audits it', async () => {
    await confirmAdminStep(MEMBER, 'signal_group')
    recordAudit.mockClear()
    expect(await unconfirmAdminStep(MEMBER, 'signal_group')).toEqual({
      status: 'done',
      changed: true,
    })
    expect(rows).toEqual([])
    expect(recordAudit).toHaveBeenCalledWith(expect.anything(), {
      actorId: 'admin-1',
      action: 'onboarding.step_unconfirmed',
      entityType: 'user_onboarding',
      entityId: MEMBER,
      details: { step: 'signal_group' },
    })
  })

  it('is idempotent: unconfirming an open step changes and audits nothing', async () => {
    expect(await unconfirmAdminStep(MEMBER, 'signal_group')).toEqual({
      status: 'done',
      changed: false,
    })
    expect(recordAudit).not.toHaveBeenCalled()
  })
})
