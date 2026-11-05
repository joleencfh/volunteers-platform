import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/database.types'
import { supabasePublicConfig } from './config'

/** Browser client. Only starts the Google redirect; every read and write goes through the server. */
export function createClient() {
  const { url, key } = supabasePublicConfig()
  return createBrowserClient<Database>(url, key)
}
