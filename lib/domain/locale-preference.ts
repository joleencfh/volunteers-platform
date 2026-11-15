import { isLocale, type Locale } from './locale'

// The saved language preference, mirrored from users.locale into a cookie so proxy.ts can read it
// without a database call on every request (ADR-0016). It is a preference, not an authority.
export const LOCALE_COOKIE = 'pauseai_locale'
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

/** The cookie value as a supported locale, or null for a missing or unsupported one. */
export function parseLocaleCookie(value: string | null | undefined): Locale | null {
  return isLocale(value) ? value : null
}

/** Cookie settings: not readable from scripts (only the proxy reads it), no personal data. */
export function localeCookieOptions(isProduction: boolean) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isProduction,
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
  }
}
