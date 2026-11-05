import { describe, expect, it } from 'vitest'
import { fillNotice, NOTICE_VERSION } from '@/lib/domain/notice'
import notice from '@/messages/privacy-notice.it.json'

describe('fillNotice', () => {
  it('replaces known tokens and leaves unknown ones', () => {
    expect(fillNotice('{a} mesi, {b}', { a: 6 })).toBe('6 mesi, {b}')
  })
})

describe('privacy notice', () => {
  it('has a version', () => {
    expect(NOTICE_VERSION).not.toBe('placeholder')
    expect(NOTICE_VERSION.length).toBeGreaterThan(0)
  })

  it('uses only tokens the page fills', () => {
    const text = JSON.stringify(notice)
    const tokens = new Set([...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]))
    expect([...tokens].sort()).toEqual(['leaverMonths', 'rejectedMonths'])
  })
})
