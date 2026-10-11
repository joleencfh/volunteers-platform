// Seeds the fixture users through the admin API before the end-to-end run. Skipped when no
// Supabase settings are configured, so UI-only tests still run on a machine without a database.
import { randomUUID } from 'node:crypto'
import { FIXTURE_USERS } from '../fixtures/users'
import { ensureUser, supabaseEnv } from '../helpers/supabase'

export default async function globalSetup() {
  if (!supabaseEnv()) {
    console.log('E2E fixtures skipped: no Supabase settings (tests needing them will skip).')
    return
  }
  // One throwaway password per run, shared with the test workers through the environment
  const password = randomUUID()
  process.env.E2E_PASSWORD = password
  for (const user of FIXTURE_USERS) await ensureUser(user, password)
}
