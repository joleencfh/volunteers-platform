import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import type { Database } from '@/lib/database.types'
import { seedAdmin } from '../../scripts/seed-admin-core'

const EMAIL = 'first-admin@example.test'

type Options = {
  authUserExists?: boolean
  memberExists?: boolean
  createErrorCode?: string
  insertErrorCode?: string
}

function fakeClient(options: Options = {}) {
  const createUser = vi.fn().mockResolvedValue(
    options.authUserExists || options.createErrorCode
      ? {
          data: { user: null },
          error: { code: options.createErrorCode ?? 'email_exists' },
        }
      : { data: { user: { id: 'new-id' } }, error: null },
  )
  const listUsers = vi
    .fn()
    .mockResolvedValue({ data: { users: [{ id: 'old-id', email: EMAIL }] }, error: null })
  const insert = vi.fn().mockResolvedValue({
    error: options.insertErrorCode ? { code: options.insertErrorCode } : null,
  })
  const eq = vi.fn().mockResolvedValue({ error: null })
  const update = vi.fn().mockReturnValue({ eq })
  const maybeSingle = vi
    .fn()
    .mockResolvedValue({ data: options.memberExists ? { id: 'old-id' } : null, error: null })
  const select = vi.fn().mockReturnValue({ eq: () => ({ maybeSingle }) })
  const client = {
    auth: { admin: { createUser, listUsers } },
    from: () => ({ select, insert, update }),
  } as unknown as SupabaseClient<Database>
  return { client, createUser, listUsers, insert, update, eq }
}

describe('seedAdmin', () => {
  it('creates a confirmed auth user and an active admin member', async () => {
    const { client, createUser, insert } = fakeClient()
    await expect(seedAdmin(client, EMAIL)).resolves.toBe('created')
    expect(createUser).toHaveBeenCalledWith({ email: EMAIL, email_confirm: true })
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'new-id', email: EMAIL, is_admin: true, level: 'experienced' }),
    )
  })

  it('stores the email in lower case and trims it', async () => {
    const { client, createUser } = fakeClient()
    await seedAdmin(client, '  First-Admin@Example.TEST ')
    expect(createUser).toHaveBeenCalledWith({ email: EMAIL, email_confirm: true })
  })

  it('finds an existing auth user and adds the member row', async () => {
    const { client, listUsers, insert } = fakeClient({ authUserExists: true })
    await expect(seedAdmin(client, EMAIL)).resolves.toBe('created')
    expect(listUsers).toHaveBeenCalled()
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ id: 'old-id' }))
  })

  it('promotes an existing member without touching their names or level', async () => {
    const { client, insert, update, eq } = fakeClient({ authUserExists: true, memberExists: true })
    await expect(seedAdmin(client, EMAIL)).resolves.toBe('promoted')
    expect(update).toHaveBeenCalledWith({ is_admin: true, status: 'active' })
    expect(eq).toHaveBeenCalledWith('id', 'old-id')
    expect(insert).not.toHaveBeenCalled()
  })

  it.each([undefined, '', 'not-an-email'])('refuses the email %s', async (email) => {
    const { client, createUser } = fakeClient()
    await expect(seedAdmin(client, email)).rejects.toThrow('SEED_ADMIN_EMAIL')
    expect(createUser).not.toHaveBeenCalled()
  })

  it('reports failures by code, without the email', async () => {
    const created = fakeClient({ createErrorCode: 'unexpected_failure' })
    await expect(seedAdmin(created.client, EMAIL)).rejects.toThrow(
      'Creating the auth user failed (unexpected_failure)',
    )

    const inserted = fakeClient({ insertErrorCode: '23505' })
    const failure = seedAdmin(inserted.client, EMAIL)
    await expect(failure).rejects.toThrow('Creating the member failed (23505)')
    await expect(failure).rejects.not.toThrow(EMAIL)
  })
})
