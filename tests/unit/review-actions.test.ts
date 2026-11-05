import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setEmailTransport, type EmailMessage } from '@/lib/email/transport'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

let admin: { id: string } | 'not-admin' = { id: 'admin-1' }
vi.mock('@/lib/authz', () => ({
  requireAdmin: async () => {
    if (admin === 'not-admin') throw new Error('NOT_FOUND')
    return admin
  },
}))

const recordAudit = vi.fn()
vi.mock('@/lib/audit', () => ({ recordAudit: (...args: unknown[]) => recordAudit(...args) }))

type Application = {
  id: string
  status: 'pending' | 'approved' | 'rejected'
  email: string
  display_name: string
  real_name: string
  city: string
}

const APPLICATION_ID = '8b1c2f3e-4d5a-4b6c-8d7e-9f0a1b2c3d4e'

// A small in-memory stand-in for the service-role client.
let application: Application | null
let memberRows: Record<string, unknown>[]
let authUsers: { id: string; email: string }[]
const createUser = vi.fn()
const usersInsert = vi.fn()

function fakeDb() {
  return {
    from(table: string) {
      if (table === 'users') {
        return {
          insert: async (row: Record<string, unknown>) => {
            usersInsert(row)
            if (memberRows.some((existing) => existing.id === row.id)) {
              return { error: { code: '23505' } }
            }
            memberRows.push(row)
            return { error: null }
          },
          select: () => ({
            eq: () => ({
              eq: async () => ({ data: [{ email: 'admin@example.test' }], error: null }),
            }),
          }),
        }
      }
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: application, error: null }) }),
        }),
        update: (values: Partial<Application>) => ({
          eq: () => ({
            eq: (_column: string, status: string) => ({
              select: async () => {
                if (!application || application.status !== status) return { data: [], error: null }
                Object.assign(application, values)
                return { data: [{ id: application.id }], error: null }
              },
            }),
          }),
        }),
      }
    },
    auth: {
      admin: {
        createUser: async ({ email }: { email: string }) => {
          createUser(email)
          const existing = authUsers.find((user) => user.email === email)
          if (existing) return { data: { user: null }, error: { code: 'email_exists' } }
          const user = { id: `auth-${authUsers.length + 1}`, email }
          authUsers.push(user)
          return { data: { user }, error: null }
        },
        listUsers: async () => ({ data: { users: authUsers }, error: null }),
      },
    },
  }
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeDb() }))

const sent: EmailMessage[] = []
let transportFails = false

const form = (fields: Record<string, string>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}
const idle = { status: 'idle' } as const

async function load() {
  return import('@/app/[lang]/admin/applications/actions')
}

beforeEach(() => {
  admin = { id: 'admin-1' }
  application = {
    id: APPLICATION_ID,
    status: 'pending',
    email: 'Ada@Example.test',
    display_name: 'Ada',
    real_name: 'Ada Example',
    city: 'Test City',
  }
  memberRows = []
  authUsers = []
  sent.length = 0
  transportFails = false
  createUser.mockClear()
  usersInsert.mockClear()
  recordAudit.mockReset()
  setEmailTransport(async (message) => {
    if (transportFails) throw new Error('provider down')
    sent.push(message)
  })
})

describe('approveApplication', () => {
  it('refuses a non-admin before touching anything', async () => {
    admin = 'not-admin'
    const { approveApplication } = await load()
    await expect(
      approveApplication(idle, form({ applicationId: APPLICATION_ID, level: 'new' })),
    ).rejects.toThrow('NOT_FOUND')
    expect(createUser).not.toHaveBeenCalled()
    expect(application?.status).toBe('pending')
    expect(sent).toHaveLength(0)
  })

  it('creates the Auth user and the member, marks the application, audits and emails in Italian', async () => {
    const { approveApplication } = await load()
    const result = await approveApplication(
      idle,
      form({ applicationId: APPLICATION_ID, level: 'new' }),
    )
    expect(result).toEqual({ status: 'done', emailSent: true })
    expect(createUser).toHaveBeenCalledWith('ada@example.test')
    expect(memberRows).toEqual([
      expect.objectContaining({ id: 'auth-1', email: 'ada@example.test', level: 'new' }),
    ])
    expect(application).toMatchObject({ status: 'approved', decided_by: 'admin-1' })
    expect(recordAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorId: 'admin-1',
        action: 'application.approved',
        entityId: APPLICATION_ID,
        details: { userId: 'auth-1', level: 'new', reason: null },
      }),
    )
    expect(sent).toHaveLength(1)
    expect(sent[0].to).toBe('ada@example.test')
    expect(sent[0].subject).toContain('accolta')
    expect(sent[0].text).toContain('/login')
  })

  it('is idempotent: approving twice makes one user, one audit entry and one email', async () => {
    const { approveApplication } = await load()
    const data = () => form({ applicationId: APPLICATION_ID, level: 'new' })
    await approveApplication(idle, data())
    const second = await approveApplication(idle, data())
    expect(second).toEqual({ status: 'done' })
    expect(createUser).toHaveBeenCalledOnce()
    expect(memberRows).toHaveLength(1)
    expect(recordAudit).toHaveBeenCalledOnce()
    expect(sent).toHaveLength(1)
  })

  it('reuses an Auth user left behind by a half-finished approval', async () => {
    authUsers.push({ id: 'auth-existing', email: 'ada@example.test' })
    const { approveApplication } = await load()
    await approveApplication(idle, form({ applicationId: APPLICATION_ID, level: 'new' }))
    expect(memberRows[0]).toMatchObject({ id: 'auth-existing' })
  })

  it('needs a reason for a higher starting level and records it in the audit log', async () => {
    const { approveApplication } = await load()
    const refused = await approveApplication(
      idle,
      form({ applicationId: APPLICATION_ID, level: 'experienced', reason: '  ' }),
    )
    expect(refused).toEqual({ status: 'invalid', errors: { reason: 'reasonRequired' } })
    expect(application?.status).toBe('pending')
    expect(createUser).not.toHaveBeenCalled()

    await approveApplication(
      idle,
      form({ applicationId: APPLICATION_ID, level: 'experienced', reason: 'Led groups elsewhere' }),
    )
    expect(memberRows[0]).toMatchObject({ level: 'experienced' })
    expect(recordAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        details: { userId: 'auth-1', level: 'experienced', reason: 'Led groups elsewhere' },
      }),
    )
  })

  it('rejects malformed input and unknown applications', async () => {
    const { approveApplication } = await load()
    expect(await approveApplication(idle, form({ applicationId: 'nope', level: 'new' }))).toEqual({
      status: 'invalid',
      errors: { applicationId: 'invalidApplication' },
    })
    expect(
      await approveApplication(idle, form({ applicationId: APPLICATION_ID, level: 'god' })),
    ).toMatchObject({ status: 'invalid', errors: { level: 'invalidLevel' } })
    application = null
    expect(
      await approveApplication(idle, form({ applicationId: APPLICATION_ID, level: 'new' })),
    ).toEqual({ status: 'notFound' })
  })

  it('does not approve what was already rejected', async () => {
    if (application) application.status = 'rejected'
    const { approveApplication } = await load()
    expect(
      await approveApplication(idle, form({ applicationId: APPLICATION_ID, level: 'new' })),
    ).toEqual({ status: 'conflict' })
    expect(createUser).not.toHaveBeenCalled()
  })

  it('keeps the decision when the email fails and says so', async () => {
    transportFails = true
    const { approveApplication } = await load()
    const result = await approveApplication(
      idle,
      form({ applicationId: APPLICATION_ID, level: 'new' }),
    )
    expect(result).toEqual({ status: 'done', emailSent: false })
    expect(application?.status).toBe('approved')
  })
})

describe('rejectApplication', () => {
  it('refuses a non-admin', async () => {
    admin = 'not-admin'
    const { rejectApplication } = await load()
    await expect(rejectApplication(idle, form({ applicationId: APPLICATION_ID }))).rejects.toThrow(
      'NOT_FOUND',
    )
    expect(application?.status).toBe('pending')
    expect(sent).toHaveLength(0)
  })

  it('marks the application rejected, creates no user, audits and emails once', async () => {
    const { rejectApplication } = await load()
    const data = () => form({ applicationId: APPLICATION_ID })
    expect(await rejectApplication(idle, data())).toEqual({ status: 'done', emailSent: true })
    expect(await rejectApplication(idle, data())).toEqual({ status: 'done' })
    expect(application).toMatchObject({ status: 'rejected', decided_by: 'admin-1' })
    expect(createUser).not.toHaveBeenCalled()
    expect(memberRows).toHaveLength(0)
    expect(recordAudit).toHaveBeenCalledOnce()
    expect(sent).toHaveLength(1)
    expect(sent[0].subject).toContain('candidatura')
  })

  it('does not reject what was already approved', async () => {
    if (application) application.status = 'approved'
    const { rejectApplication } = await load()
    expect(await rejectApplication(idle, form({ applicationId: APPLICATION_ID }))).toEqual({
      status: 'conflict',
    })
  })
})

describe('logging', () => {
  it('writes no personal data to the console, even when email fails', async () => {
    transportFails = true
    const spies = (['log', 'error', 'warn'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {}),
    )
    const { approveApplication } = await load()
    await approveApplication(idle, form({ applicationId: APPLICATION_ID, level: 'new' }))
    const output = JSON.stringify(spies.flatMap((spy) => spy.mock.calls))
    for (const secret of ['ada@example.test', 'Ada Example', 'Test City']) {
      expect(output.toLowerCase()).not.toContain(secret.toLowerCase())
    }
    spies.forEach((spy) => spy.mockRestore())
  })
})
