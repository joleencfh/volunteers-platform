import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/lib/database.types'
import { supabasePublicConfig } from './config'

/** Server client acting as the signed-in person: row-level security applies. Use this for data. */
export async function createClient() {
  const cookieStore = await cookies()
  const { url, key } = supabasePublicConfig()
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Called from a Server Component, which cannot set cookies; proxy.ts refreshes them.
        }
      },
    },
  })
}
