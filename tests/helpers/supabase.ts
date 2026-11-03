// Shared by end-to-end and database tests. Reads the settings that scripts/supabase-env.ts prints
// (or that CI exports) and creates fixture users through the admin API.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { FixtureUser } from '../fixtures/users'
import { assertLocalTarget } from './local-only'

export type SupabaseEnv = { url: string; anonKey: string; serviceKey: string }

/** Returns the Supabase settings, or null when none are configured (no local database). */
export function supabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceKey) return null
  assertLocalTarget('NEXT_PUBLIC_SUPABASE_URL', url)
  return { url, anonKey, serviceKey }
}

function requireEnv(): SupabaseEnv {
  const env = supabaseEnv()
  if (!env) {
    throw new Error(
      'Supabase settings missing. Run `bun scripts/supabase-env.ts` (needs local Supabase).',
    )
  }
  return env
}

export function adminClient(env: SupabaseEnv = requireEnv()): SupabaseClient {
  return createClient(env.url, env.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * Extension point for A-01: once public.users exists, insert or update the user's row here so the
 * level and admin flag come from the database. Until then they live in the auth user's app_metadata.
 */
type Provision = (admin: SupabaseClient, userId: string, user: FixtureUser) => Promise<void>
export const provisionProfile: Provision = async () => {}

/** Creates the fixture user, or resets its password and metadata if it already exists. */
export async function ensureUser(user: FixtureUser, password: string): Promise<string> {
  const admin = adminClient()
  const appMetadata = { level: user.level, is_admin: user.isAdmin }

  const created = await admin.auth.admin.createUser({
    email: user.email,
    password,
    email_confirm: true,
    app_metadata: appMetadata,
  })

  let userId = created.data.user?.id
  if (!userId) {
    if (created.error?.code !== 'email_exists')
      throw created.error ?? new Error('createUser failed')
    const existing = await admin.auth.admin.listUsers({ perPage: 1000 })
    const match = existing.data.users.find((candidate) => candidate.email === user.email)
    if (!match) throw new Error(`User ${user.email} exists but was not found`)
    userId = match.id
    const updated = await admin.auth.admin.updateUserById(userId, {
      password,
      app_metadata: appMetadata,
    })
    if (updated.error) throw updated.error
  }

  await provisionProfile(admin, userId, user)
  return userId
}
