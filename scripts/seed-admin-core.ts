// The logic of scripts/seed-admin.ts, separate so it can be tested without a database.
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Database } from '../lib/database.types'

const PLACEHOLDER_NAME = 'Admin'
const PAGE_SIZE = 1000

const emailSchema = z.email()

export type SeedResult = 'created' | 'promoted'

async function findAuthUserId(client: SupabaseClient<Database>, email: string) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: PAGE_SIZE })
    if (error) throw new Error(`Listing auth users failed (${error.code})`)
    const match = data.users.find((user) => user.email?.toLowerCase() === email)
    if (match) return match.id
    if (data.users.length < PAGE_SIZE) return null
  }
}

async function ensureAuthUser(client: SupabaseClient<Database>, email: string) {
  const created = await client.auth.admin.createUser({ email, email_confirm: true })
  if (created.data.user) return created.data.user.id
  if (created.error?.code !== 'email_exists') {
    throw new Error(`Creating the auth user failed (${created.error?.code})`)
  }
  const id = await findAuthUserId(client, email)
  if (!id) throw new Error('The auth user exists but was not found')
  return id
}

/**
 * Makes the person with this email an active admin. Safe to run again: an existing member keeps
 * their names and level. A new member starts with placeholder names, edited in the table editor.
 * Error messages carry codes only, because the database's own messages can quote the email.
 */
export async function seedAdmin(
  client: SupabaseClient<Database>,
  rawEmail: string | undefined,
): Promise<SeedResult> {
  const parsed = emailSchema.safeParse(rawEmail?.trim().toLowerCase())
  if (!parsed.success) throw new Error('SEED_ADMIN_EMAIL is missing or not a valid email')
  const email = parsed.data

  const id = await ensureAuthUser(client, email)

  const existing = await client.from('users').select('id').eq('id', id).maybeSingle()
  if (existing.error) throw new Error(`Reading the member failed (${existing.error.code})`)

  if (existing.data) {
    const updated = await client
      .from('users')
      .update({ is_admin: true, status: 'active' })
      .eq('id', id)
    if (updated.error) throw new Error(`Updating the member failed (${updated.error.code})`)
    return 'promoted'
  }

  const inserted = await client.from('users').insert({
    id,
    email,
    display_name: PLACEHOLDER_NAME,
    real_name: PLACEHOLDER_NAME,
    level: 'experienced',
    is_admin: true,
  })
  if (inserted.error) throw new Error(`Creating the member failed (${inserted.error.code})`)
  return 'created'
}
