import { beforeEach, describe, expect, it, vi } from 'vitest'
import { notifyAdminsOfApplication } from '@/lib/email/notify'
import {
  applicationApprovedEmail,
  applicationRejectedEmail,
  newApplicationEmail,
} from '@/lib/email/templates'
import { createResendTransport, setEmailTransport, type EmailMessage } from '@/lib/email/transport'
import { parseApproval, parseRejection } from '@/lib/domain/review'

vi.mock('server-only', () => ({}))

let adminEmails: { email: string }[] = []
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ eq: async () => ({ data: adminEmails, error: null }) }) }),
    }),
  }),
}))

describe('createResendTransport', () => {
  it('posts the message with the key and reports only the status on failure', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"to":"ada@example.test"}', { status: 422 }))
    const send = createResendTransport('key', 'PauseAI <no-reply@example.test>', fetchImpl)

    await expect(send({ to: 'ada@example.test', subject: 'S', text: 'T' })).rejects.toThrow(
      'Email provider refused the message (422)',
    )
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer key')
    expect(JSON.parse(init.body as string)).toEqual({
      from: 'PauseAI <no-reply@example.test>',
      to: ['ada@example.test'],
      subject: 'S',
      text: 'T',
    })
  })
})

describe('templates', () => {
  it('writes to applicants in Italian and to admins in English', () => {
    expect(applicationApprovedEmail('https://x.test/login').text).toContain('https://x.test/login')
    expect(applicationApprovedEmail('https://x.test/login').subject).toMatch(/accolta/)
    expect(applicationRejectedEmail('https://x.test/apply').text).toContain('https://x.test/apply')
    expect(newApplicationEmail('https://x.test/admin/applications').subject).toBe(
      'New volunteer application',
    )
  })
})

describe('notifyAdminsOfApplication', () => {
  const sent: EmailMessage[] = []
  beforeEach(() => {
    sent.length = 0
    setEmailTransport(async (message) => void sent.push(message))
  })

  it('sends one separate email per admin, without personal data about the applicant', async () => {
    adminEmails = [{ email: 'a@example.test' }, { email: 'b@example.test' }]
    await notifyAdminsOfApplication()
    expect(sent.map((message) => message.to)).toEqual(['a@example.test', 'b@example.test'])
    expect(sent[0].text).toContain('/admin/applications')
  })

  it('never throws, even when delivery fails', async () => {
    adminEmails = [{ email: 'a@example.test' }]
    vi.spyOn(console, 'error').mockImplementation(() => {})
    setEmailTransport(async () => {
      throw new Error('down')
    })
    await expect(notifyAdminsOfApplication()).resolves.toBeUndefined()
  })
})

describe('review input', () => {
  const id = '8b1c2f3e-4d5a-4b6c-8d7e-9f0a1b2c3d4e'

  it('defaults to level new and drops a reason nobody needs', () => {
    expect(parseApproval({ applicationId: id, reason: 'ignored' })).toEqual({
      ok: true,
      data: { applicationId: id, level: 'new', reason: null },
    })
  })

  it('requires a reason above new and caps its length', () => {
    expect(parseApproval({ applicationId: id, level: 'fresh', reason: '' })).toEqual({
      ok: false,
      errors: { reason: 'reasonRequired' },
    })
    expect(parseApproval({ applicationId: id, level: 'fresh', reason: 'x'.repeat(501) })).toEqual({
      ok: false,
      errors: { reason: 'tooLong' },
    })
  })

  it('rejects a missing or malformed application id', () => {
    expect(parseRejection({})).toEqual({
      ok: false,
      errors: { applicationId: 'invalidApplication' },
    })
    expect(parseRejection({ applicationId: id })).toEqual({ ok: true, data: { applicationId: id } })
  })
})
