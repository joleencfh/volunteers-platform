import { describe, expect, it } from 'vitest'
import {
  LOCALE_COOKIE,
  localeCookieOptions,
  parseLocaleCookie,
} from '@/lib/domain/locale-preference'

describe('locale preference cookie', () => {
  it('has a stable name', () => {
    expect(LOCALE_COOKIE).toBe('pauseai_locale')
  })

  it('accepts only supported locales', () => {
    expect(parseLocaleCookie('it')).toBe('it')
    expect(parseLocaleCookie('en')).toBe('en')
    expect(parseLocaleCookie('fr')).toBeNull()
    expect(parseLocaleCookie('')).toBeNull()
    expect(parseLocaleCookie(undefined)).toBeNull()
  })

  it('is httpOnly, lax, site-wide, lasts a year and is secure only in production', () => {
    const production = localeCookieOptions(true)
    expect(production).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', secure: true })
    expect(production.maxAge).toBe(31536000)
    expect(localeCookieOptions(false).secure).toBe(false)
  })
})
