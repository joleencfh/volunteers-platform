import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

// Service-role client: bypasses row-level security. For writes the person may not make
// themselves (audit log, public application insert, last_login_at). Never use it to fetch
// member data for a page; use the server client. Created lazily so builds need no secret.
let client: SupabaseClient<Database> | undefined

export function createAdminClient(): SupabaseClient<Database> {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('Supabase service role is not configured.')
    client = createClient<Database>(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }
  return client
}
