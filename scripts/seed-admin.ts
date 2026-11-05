// Makes the first admin, once per environment. See docs/runbook.md ("Add an admin").
// Usage: set SEED_ADMIN_EMAIL for this one command, then run bun scripts/seed-admin.ts
// Reads the Supabase URL and service-role key from the environment (bun loads .env.local).
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'
import { seedAdmin } from './seed-admin-core'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.')
  process.exit(1)
}

const client = createClient<Database>(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

try {
  const result = await seedAdmin(client, process.env.SEED_ADMIN_EMAIL)
  console.log(
    result === 'created' ? 'First admin created.' : 'Existing member is now an active admin.',
  )
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Seeding the admin failed.')
  process.exit(1)
}
