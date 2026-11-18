import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  notifyAdminsOfApplication,
  sendDataRequestEmail,
  sendTaskAssignedEmail,
} from '@/lib/email/notify'
import {
  applicationApprovedEmail,
  applicationRejectedEmail,
  newApplicationEmail,
  taskAssignedEmail,
} from '@/lib/email/templates'
import { createResendTransport, setEmailTransport, type EmailMessage } from '@/lib/email/transport'
import { parseApproval, parseRejection } from '@/lib/domain/review'

vi.mock('server-only', () => ({}))

let adminEmails: { email: string }[] = []
let adminTables: Record<string, () => { data: unknown; error: null }> = {}
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => {
        // The admin list awaits the chain after two eq(); the task email ends in maybeSingle().
        const chain = {
          eq: () => chain,
          maybeSingle: async () => adminTables[table](),
          then: (resolve: (value: unknown) => void) => resolve({ data: adminEmails, error: null }),
        }
        return chain
      },
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

describe('sendDataRequestEmail', () => {
  const sent: EmailMessage[] = []
  beforeEach(() => {
    sent.length = 0
    setEmailTransport(async (message) => void sent.push(message))
  })

  it('sends one email per admin with the kind, the display name and the list link only', async () => {
    adminEmails = [{ email: 'a@example.test' }, { email: 'b@example.test' }]
    await sendDataRequestEmail('export', 'Ada')
    expect(sent.map((message) => message.to)).toEqual(['a@example.test', 'b@example.test'])
    expect(sent[0].subject).toBe('Data export request')
    expect(sent[0].text).toContain('Ada')
    expect(sent[0].text).toContain('/admin/data-requests')
    expect(sent[0].text).not.toContain('@')
  })

  it('never throws, even when delivery fails', async () => {
    adminEmails = [{ email: 'a@example.test' }]
    vi.spyOn(console, 'error').mockImplementation(() => {})
    setEmailTransport(async () => {
      throw new Error('down')
    })
    await expect(sendDataRequestEmail('deletion', 'Ada')).resolves.toBeUndefined()
  })
})

describe('taskAssignedEmail', () => {
  const details = {
    title: 'Write the letter',
    groupName: 'Lobbying',
    dueOn: '2026-12-01',
    assignerName: 'Mia',
    activityUrl: 'https://x.test/groups/lobbying/activities/abc',
  }
  const facts = ['Write the letter', 'Lobbying', '2026-12-01', 'Mia', details.activityUrl]

  it('writes in English with the task, group, due date, assigner and link', () => {
    const { subject, text } = taskAssignedEmail('en', details)
    expect(subject).toContain('Write the letter')
    for (const part of facts) expect(text).toContain(part)
    expect(text).toContain('Due:')
    expect(text).not.toContain('@')
  })

  it('writes in Italian with the same facts', () => {
    const { subject, text } = taskAssignedEmail('it', details)
    expect(subject).toMatch(/assegnato/)
    for (const part of facts) expect(text).toContain(part)
    expect(text).toContain('Scadenza:')
    expect(text).not.toContain('@')
  })

  it('leaves out the due line when there is no due date, in both languages', () => {
    expect(taskAssignedEmail('en', { ...details, dueOn: null }).text).not.toContain('Due')
    expect(taskAssignedEmail('it', { ...details, dueOn: null }).text).not.toContain('Scadenza')
  })
})

describe('sendTaskAssignedEmail', () => {
  const sent: EmailMessage[] = []
  let assignee: { email: string; locale: string } | null
  let group: { name: string } | null
  const input = {
    assigneeId: 'user-1',
    groupId: 'group-1',
    slug: 'lobbying',
    activityId: 'activity-1',
    title: 'Write the letter',
    dueOn: null,
    assignerName: 'Mia',
  }

  beforeEach(() => {
    sent.length = 0
    assignee = { email: 'ada@example.test', locale: 'it' }
    group = { name: 'Lobbying' }
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://site.example.test')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    setEmailTransport(async (message) => void sent.push(message))
    adminTables = {
      users: () => ({ data: assignee, error: null }),
      working_groups: () => ({ data: group, error: null }),
    }
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('sends one email in the assignee language to their address and logs nothing', async () => {
    expect(await sendTaskAssignedEmail(input)).toBe(true)
    expect(sent).toHaveLength(1)
    expect(sent[0].to).toBe('ada@example.test')
    expect(sent[0].subject).toMatch(/assegnato/)
    expect(sent[0].text).toContain('/groups/lobbying/activities/activity-1')
    expect(sent[0].text).not.toContain('ada@example.test')
    expect(console.error).not.toHaveBeenCalled()
  })

  it('falls back to English for an unknown locale', async () => {
    assignee = { email: 'ada@example.test', locale: 'xx' }
    await sendTaskAssignedEmail(input)
    expect(sent[0].subject).toMatch(/assigned to you/)
  })

  it('returns false and sends nothing when the assignee or the group cannot be read', async () => {
    assignee = null
    expect(await sendTaskAssignedEmail(input)).toBe(false)
    assignee = { email: 'ada@example.test', locale: 'en' }
    group = null
    expect(await sendTaskAssignedEmail(input)).toBe(false)
    expect(sent).toHaveLength(0)
  })

  it('returns false when email is not configured, logging only a fixed label', async () => {
    setEmailTransport(null)
    vi.stubEnv('RESEND_API_KEY', '')
    vi.stubEnv('EMAIL_FROM', '')
    expect(await sendTaskAssignedEmail(input)).toBe(false)
    expect(console.error).toHaveBeenCalledWith(
      'Email not sent: RESEND_API_KEY or EMAIL_FROM is not set',
    )
  })

  it('returns false on a delivery failure without logging the address or the provider message', async () => {
    setEmailTransport(async () => {
      throw new Error('refused ada@example.test')
    })
    expect(await sendTaskAssignedEmail(input)).toBe(false)
    expect(console.error).toHaveBeenCalledWith('Email delivery failed')
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('ada@example.test')
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
