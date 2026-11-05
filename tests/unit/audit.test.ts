import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import type { Database } from '@/lib/database.types'
import { recordAudit } from '@/lib/audit'

vi.mock('server-only', () => ({}))

function fakeClient(error: { code: string; message: string } | null = null) {
  const insert = vi.fn().mockResolvedValue({ error })
  const from = vi.fn().mockReturnValue({ insert })
  return { client: { from } as unknown as SupabaseClient<Database>, from, insert }
}

describe('recordAudit', () => {
  it('appends the entry to audit_log', async () => {
    const { client, from, insert } = fakeClient()
    await recordAudit(client, {
      actorId: 'admin-id',
      action: 'application.approved',
      entityType: 'application',
      entityId: 'application-id',
      details: { level: 'fresh' },
    })
    expect(from).toHaveBeenCalledWith('audit_log')
    expect(insert).toHaveBeenCalledWith({
      actor_id: 'admin-id',
      action: 'application.approved',
      entity_type: 'application',
      entity_id: 'application-id',
      details: { level: 'fresh' },
    })
  })

  it('defaults the optional fields', async () => {
    const { client, insert } = fakeClient()
    await recordAudit(client, { actorId: null, action: 'config.seeded', entityType: 'config' })
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ actor_id: null, entity_id: null, details: {} }),
    )
  })

  it('throws without repeating the database message, which can quote row values', async () => {
    const { client } = fakeClient({ code: '42501', message: 'row with a@example.test' })
    const failure = recordAudit(client, {
      actorId: null,
      action: 'application.rejected',
      entityType: 'application',
    })
    await expect(failure).rejects.toThrow('Audit write failed (42501) for application.rejected')
    await expect(failure).rejects.not.toThrow('a@example.test')
  })
})
