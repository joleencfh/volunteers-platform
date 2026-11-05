import { createServerClient } from '@supabase/ssr'
import type { NextRequest, NextResponse } from 'next/server'
import { supabasePublicConfig } from './config'

/**
 * Refreshes the session cookies for a request (proxy.ts calls it on every request).
 * `respond` builds the response to forward; it is called again whenever Supabase sets cookies,
 * so the refreshed ones travel on both the request and the response.
 */
export async function refreshSession(
  request: NextRequest,
  respond: () => NextResponse,
): Promise<{ response: NextResponse; signedIn: boolean }> {
  let response = respond()
  const { url, key } = supabasePublicConfig()
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = respond()
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        )
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value))
      },
    },
  })
  // getUser() validates the token with Supabase and refreshes it when it has expired.
  const { data } = await supabase.auth.getUser()
  return { response, signedIn: Boolean(data.user) }
}
