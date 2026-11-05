// Which paths a logged-out visitor may open, and where sign-in may send someone afterwards.
// Paths here are URL paths without a locale prefix (proxy.ts adds the locale by rewriting).
import { LOCALES } from './locale'

const PUBLIC_EXACT = ['/', '/login', '/privacy']
const PUBLIC_PREFIXES = ['/apply', '/auth']

function isUnder(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`)
}

/**
 * True for `/en`, `/it/privacy` and the like. The locale is added by the proxy and never typed in
 * a URL, so such paths do not exist (they 404) and must not be sent to the login page first.
 */
export function hasLocalePrefix(pathname: string): boolean {
  return LOCALES.some((locale) => isUnder(pathname, `/${locale}`))
}

/**
 * Public routes: `/`, `/login`, `/privacy`, `/apply*` and `/auth/*`. Everything else needs a
 * session. `allowDev` also opens `/dev/*` (the style guide) outside production.
 */
export function isPublicRoute(pathname: string, allowDev = false): boolean {
  if (PUBLIC_EXACT.includes(pathname)) return true
  if (PUBLIC_PREFIXES.some((route) => isUnder(pathname, route))) return true
  return allowDev && isUnder(pathname, '/dev')
}

/** `/auth/*` are route handlers outside the locale tree: proxy.ts must not rewrite them. */
export function isAuthRoute(pathname: string): boolean {
  return isUnder(pathname, '/auth')
}

const DEFAULT_NEXT = '/'

/**
 * The redirect target after sign-in, from an untrusted `next` value. Only a plain same-site
 * path is allowed (one leading slash, no scheme, host, backslash or control character), and
 * never an auth route, so the callback cannot be pointed at another site or loop on itself.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return DEFAULT_NEXT
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return DEFAULT_NEXT
  const pathname = next.split(/[?#]/)[0]
  if (isAuthRoute(pathname) || pathname === '/login') return DEFAULT_NEXT
  return next
}

/**
 * Origins sign-in links may point back to: the configured site URL plus the local dev servers
 * outside production. Fails closed: with nothing configured in production the list is empty.
 */
export function allowedOrigins(siteUrl: string | undefined, isProduction: boolean): string[] {
  const origins = new Set<string>()
  if (siteUrl) {
    try {
      origins.add(new URL(siteUrl).origin)
    } catch {
      // An unparsable value allows nothing.
    }
  }
  if (!isProduction) {
    origins.add('http://localhost:3000')
    origins.add('http://127.0.0.1:3000')
  }
  return [...origins]
}

/** The request's own origin if it is on the allowlist, otherwise null. */
export function pickRedirectOrigin(
  requestOrigin: string | null | undefined,
  allowed: string[],
): string | null {
  if (!requestOrigin) return null
  return allowed.includes(requestOrigin) ? requestOrigin : null
}
