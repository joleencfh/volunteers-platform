import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_RETENTION_MONTHS } from '@/lib/domain/notice'

vi.mock('server-only', () => ({}))

// The public notice must read with the row-level-security client, never the service role.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    throw new Error('the privacy notice must not use the service role')
  },
}))

type Result = { data: { key: string; value: unknown }[] | null; error: unknown }
let result: Result | 'throws'
const inKeys = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => ({
      select: () => ({
        in: async (column: string, keys: string[]) => {
          inKeys(table, column, keys)
          if (result === 'throws') throw new Error('network down')
          return result
        },
      }),
    }),
  }),
}))

async function load() {
  return import('@/lib/notice-retention')
}

beforeEach(() => {
  inKeys.mockClear()
  result = { data: [], error: null }
})

describe('getRetentionMonths', () => {
  it('reads only the two public retention keys from config', async () => {
    result = {
      data: [
        { key: 'retention.rejected_applications_months', value: 3 },
        { key: 'retention.people_who_leave_months', value: 24 },
      ],
      error: null,
    }
    const { getRetentionMonths } = await load()
    expect(await getRetentionMonths()).toEqual({ rejectedApplications: 3, leavers: 24 })
    expect(inKeys).toHaveBeenCalledWith('config', 'key', [
      'retention.rejected_applications_months',
      'retention.people_who_leave_months',
    ])
  })

  it('uses the defaults for a missing or invalid value', async () => {
    result = {
      data: [{ key: 'retention.rejected_applications_months', value: 'soon' }],
      error: null,
    }
    const { getRetentionMonths } = await load()
    expect(await getRetentionMonths()).toEqual(DEFAULT_RETENTION_MONTHS)
  })

  it('falls back to the defaults and says why when the read fails', async () => {
    result = { data: null, error: { message: 'permission denied' } }
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { getRetentionMonths } = await load()
    expect(await getRetentionMonths()).toEqual(DEFAULT_RETENTION_MONTHS)
    expect(JSON.stringify(error.mock.calls)).toContain('retention')
    error.mockRestore()
  })

  it('never throws, even when the client does', async () => {
    result = 'throws'
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { getRetentionMonths } = await load()
    expect(await getRetentionMonths()).toEqual(DEFAULT_RETENTION_MONTHS)
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})
