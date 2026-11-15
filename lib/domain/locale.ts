export const LOCALES = ['en', 'it'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'en'

export function isLocale(value: string | null | undefined): value is Locale {
  return LOCALES.some((locale) => locale === value)
}

// Screens shown to people who are not signed in yet. Italian from v1 (CLAUDE.md rule 1),
// whatever any later language preference says.
const ITALIAN_ROUTES = ['/apply', '/privacy']

function isUnder(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`)
}

/**
 * The locale a URL path is rendered in: the legal routes are Italian, everything else the preferred language, English by default.
 * `preferred` is the signed-in user's saved language (the cookie mirrored from users.locale); it
 * only applies outside the legal routes.
 */
export function localeForPath(pathname: string, preferred?: string | null): Locale {
  if (ITALIAN_ROUTES.some((route) => isUnder(pathname, route))) return 'it'
  return isLocale(preferred) ? preferred : DEFAULT_LOCALE
}
