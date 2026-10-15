import { describe, expect, it } from 'vitest'
import { isLocale, localeForPath } from '@/lib/domain/locale'

describe('localeForPath', () => {
  it.each(['/apply', '/apply/pending', '/apply/rejected', '/privacy'])(
    'renders %s in Italian',
    (path) => {
      expect(localeForPath(path)).toBe('it')
    },
  )

  it.each(['/', '/profile', '/groups/lobbying', '/applyish', '/privacy-policy', '/admin/apply'])(
    'renders %s in English',
    (path) => {
      expect(localeForPath(path)).toBe('en')
    },
  )

  it('keeps the legal routes Italian whatever the user prefers', () => {
    expect(localeForPath('/privacy', 'en')).toBe('it')
  })

  it('uses a supported user preference elsewhere and ignores an unsupported one', () => {
    expect(localeForPath('/profile', 'it')).toBe('it')
    expect(localeForPath('/profile', 'fr')).toBe('en')
    expect(localeForPath('/profile', null)).toBe('en')
  })
})

describe('isLocale', () => {
  it('accepts only supported locales', () => {
    expect(isLocale('en')).toBe(true)
    expect(isLocale('it')).toBe(true)
    expect(isLocale('fr')).toBe(false)
    expect(isLocale(undefined)).toBe(false)
  })
})
