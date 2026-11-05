// Security headers sent on every route (see ADR-0008). Pure, so it can be unit tested and imported
// from next.config.ts, which cannot use the "@/" alias.

export interface SecurityHeader {
  key: string
  value: string
}

interface Options {
  /** Public Supabase project URL; the browser talks to it (REST, auth, realtime). */
  supabaseUrl?: string
  /** `next dev` needs eval for React debugging and a websocket for hot reload. */
  isDev?: boolean
}

function origin(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

export function buildCsp({ supabaseUrl, isDev = false }: Options = {}): string {
  const supabase = origin(supabaseUrl)
  const connect = ["'self'"]
  if (supabase) connect.push(supabase, supabase.replace(/^http/, 'ws'))
  if (isDev) connect.push('ws://localhost:*')

  // Not nonce-based: nonces force dynamic rendering of every page, which Cache Components and
  // Partial Prefetching (both on) rely on avoiding. 'unsafe-inline' is needed for the inline
  // hydration scripts and styles Next.js emits; the other directives still block framing,
  // plugins, foreign origins and base-tag hijacking.
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src ${connect.join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ]
  if (!isDev) directives.push('upgrade-insecure-requests')
  return directives.join('; ')
}

export function securityHeaders(options: Options = {}): SecurityHeader[] {
  return [
    { key: 'Content-Security-Policy', value: buildCsp(options) },
    // frame-ancestors covers modern browsers; X-Frame-Options covers old ones.
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    },
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  ]
}
