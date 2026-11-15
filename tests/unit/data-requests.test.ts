import { describe, expect, it } from 'vitest'
import { parseDataRequestKind, parseRequestId, sortRequests } from '@/lib/domain/data-requests'
import { dataRequestEmail } from '@/lib/email/templates'

describe('parseDataRequestKind', () => {
  it('accepts export and deletion and nothing else', () => {
    expect(parseDataRequestKind('export')).toBe('export')
    expect(parseDataRequestKind('deletion')).toBe('deletion')
    for (const value of ['', 'Export', 'delete', null, undefined, 3]) {
      expect(parseDataRequestKind(value), String(value)).toBeNull()
    }
  })
})

describe('parseRequestId', () => {
  it('accepts a UUID only', () => {
    const id = '8b1c2f3e-4d5a-4b6c-8d7e-9f0a1b2c3d4e'
    expect(parseRequestId(id)).toBe(id)
    expect(parseRequestId('nope')).toBeNull()
    expect(parseRequestId(null)).toBeNull()
  })
})

describe('sortRequests', () => {
  it('lists open requests first, newest first within each group', () => {
    const rows = [
      { id: 'a', status: 'done' as const, created_at: '2026-11-03T10:00:00Z' },
      { id: 'b', status: 'open' as const, created_at: '2026-11-01T10:00:00Z' },
      { id: 'c', status: 'open' as const, created_at: '2026-11-02T10:00:00Z' },
      { id: 'd', status: 'done' as const, created_at: '2026-11-04T10:00:00Z' },
    ]
    expect(sortRequests(rows).map((row) => row.id)).toEqual(['c', 'b', 'd', 'a'])
    expect(rows[0].id).toBe('a')
  })
})

describe('dataRequestEmail', () => {
  it('names the kind, the display name and the admin list, and no address or real name', () => {
    const email = dataRequestEmail('deletion', 'Ada', 'https://x.test/admin/data-requests')
    expect(email.subject).toBe('Data deletion request')
    expect(email.text).toContain('Ada')
    expect(email.text).toContain('deletion')
    expect(email.text).toContain('https://x.test/admin/data-requests')
    expect(email.text).not.toMatch(/@/)
    expect(dataRequestEmail('export', 'Ada', 'https://x.test/l').text).toContain('export')
  })
})
