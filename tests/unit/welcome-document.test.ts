import { describe, expect, it } from 'vitest'
import { parseWelcomeLink } from '@/lib/domain/welcome-document'

describe('parseWelcomeLink', () => {
  it('returns a valid https link', () => {
    expect(parseWelcomeLink('https://example.org/welcome')).toBe('https://example.org/welcome')
  })

  it('accepts http and trims the value', () => {
    expect(parseWelcomeLink('  http://example.org/a  ')).toBe('http://example.org/a')
  })

  it('refuses a javascript: link', () => {
    expect(parseWelcomeLink('javascript:alert(1)')).toBeNull()
  })

  it('refuses other schemes', () => {
    expect(parseWelcomeLink('data:text/html,<p>x</p>')).toBeNull()
    expect(parseWelcomeLink('file:///etc/passwd')).toBeNull()
    expect(parseWelcomeLink('ftp://example.org/a')).toBeNull()
    expect(parseWelcomeLink('mailto:someone@example.org')).toBeNull()
  })

  it('refuses relative paths and text that is not a URL', () => {
    expect(parseWelcomeLink('/welcome')).toBeNull()
    expect(parseWelcomeLink('welcome.pdf')).toBeNull()
    expect(parseWelcomeLink('//example.org/a')).toBeNull()
    expect(parseWelcomeLink('not a url')).toBeNull()
  })

  it('returns null for an empty or blank value', () => {
    expect(parseWelcomeLink('')).toBeNull()
    expect(parseWelcomeLink('   ')).toBeNull()
  })

  it('returns null when the stored value is not a string', () => {
    expect(parseWelcomeLink(null)).toBeNull()
    expect(parseWelcomeLink(undefined)).toBeNull()
    expect(parseWelcomeLink(42)).toBeNull()
    expect(parseWelcomeLink({ url: 'https://example.org' })).toBeNull()
  })
})
