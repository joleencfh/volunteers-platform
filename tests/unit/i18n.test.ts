import { describe, expect, it } from 'vitest'
import { createFormatter, createTranslator } from 'use-intl/core'
import { getMessages, mergeMessages } from '@/lib/i18n/messages'
import { TIME_ZONE } from '@/lib/i18n/config'
import it_ from '@/messages/it.json'

describe('mergeMessages', () => {
  it('keeps base keys the override does not translate', () => {
    const merged = mergeMessages({ a: { x: 'X', y: 'Y' }, b: 'B' }, { a: { x: 'Ix' } })
    expect(merged).toEqual({ a: { x: 'Ix', y: 'Y' }, b: 'B' })
  })
})

describe('getMessages', () => {
  it('returns Italian where translated', () => {
    expect(getMessages('it').privacy.title).toBe(it_.privacy.title)
  })

  it('falls back to English for a key Italian lacks', () => {
    expect(getMessages('it').home.title).toBe(getMessages('en').home.title)
  })

  it('has no Italian key that English lacks', () => {
    const english = getMessages('en')
    for (const [section, entries] of Object.entries(it_)) {
      for (const key of Object.keys(entries)) {
        expect(english, `${section}.${key}`).toHaveProperty([section, key])
      }
    }
  })
})

describe('locale-aware formatting', () => {
  const date = new Date('2026-03-05T12:00:00Z')

  it('formats dates and numbers per locale', () => {
    const en = createFormatter({ locale: 'en', timeZone: TIME_ZONE })
    const it = createFormatter({ locale: 'it', timeZone: TIME_ZONE })
    expect(en.dateTime(date, { dateStyle: 'long' })).toBe('March 5, 2026')
    expect(it.dateTime(date, { dateStyle: 'long' })).toBe('5 marzo 2026')
    expect(en.number(12345.5)).toBe('12,345.5')
    expect(it.number(12345.5)).toBe('12.345,5')
  })

  it('translates through the typed translator', () => {
    const t = createTranslator({ locale: 'it', messages: getMessages('it'), namespace: 'apply' })
    expect(t('title')).toBe('Candidati come volontario')
  })
})
