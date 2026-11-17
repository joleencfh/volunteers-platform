import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`)
  },
}))

let admin: { id: string } | 'not-admin' = { id: 'admin-1' }
vi.mock('@/lib/authz', () => ({
  requireAdmin: async () => {
    if (admin === 'not-admin') throw new Error('NOT_FOUND')
    return admin
  },
}))

const recordAudit = vi.fn()
vi.mock('@/lib/audit', () => ({ recordAudit: (...args: unknown[]) => recordAudit(...args) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ service: true }) }))

const onGroupCreated = vi.fn(async (groupId: string) => void groupId)
vi.mock('@/lib/domain/admin-groups', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/domain/admin-groups')>()),
  onGroupCreated: (groupId: string) => onGroupCreated(groupId),
}))

// A recording stand-in for the RLS client: every chained call is noted, and the test decides what
// each finished query returns.
type Call = {
  table: string
  op: 'select' | 'insert' | 'update' | 'delete'
  payload?: unknown
  filters: [string, ...unknown[]][]
}
type Result = { data: unknown; error: { code: string } | null }
const calls: Call[] = []
let respond: (call: Call) => Result

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      const call: Call = { table, op: 'select', filters: [] }
      const finish = () => {
        calls.push(call)
        return Promise.resolve(respond(call))
      }
      const builder: Record<string, unknown> = {}
      for (const op of ['insert', 'update'] as const) {
        builder[op] = (payload: unknown) => {
          call.op = op
          call.payload = payload
          return builder
        }
      }
      builder.delete = () => {
        call.op = 'delete'
        return builder
      }
      builder.select = () => builder
      for (const filter of ['eq', 'is', 'not']) {
        builder[filter] = (...args: unknown[]) => {
          call.filters.push([filter, ...args])
          return builder
        }
      }
      builder.maybeSingle = finish
      builder.single = finish
      builder.then = (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) =>
        finish().then(resolve, reject)
      return builder
    },
  }),
}))

import {
  addGroupMember,
  archiveGroup,
  createGroup,
  removeGroupMember,
  restoreGroup,
  updateGroup,
  type GroupAdminState,
} from '@/app/[lang]/admin/groups/actions'

const GROUP = '8b1c2f3e-4d5a-4b6c-8d7e-9f0a1b2c3d4e'
const PERSON = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
const idle: GroupAdminState = { status: 'idle' }

const form = (values: Record<string, string>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

const writes = () => calls.filter((call) => call.op !== 'select')

beforeEach(() => {
  vi.clearAllMocks()
  calls.length = 0
  admin = { id: 'admin-1' }
  respond = () => ({ data: null, error: null })
})

describe('every action is refused for a non-admin before anything happens', () => {
  const cases: [string, (state: GroupAdminState, data: FormData) => Promise<unknown>, object][] = [
    ['createGroup', createGroup, { name: 'Outreach', slug: 'outreach', description: 'Words.' }],
    ['updateGroup', updateGroup, { groupId: GROUP, name: 'A', description: 'B' }],
    ['archiveGroup', archiveGroup, { groupId: GROUP }],
    ['restoreGroup', restoreGroup, { groupId: GROUP }],
    ['addGroupMember', addGroupMember, { groupId: GROUP, userId: PERSON }],
    ['removeGroupMember', removeGroupMember, { groupId: GROUP, userId: PERSON }],
  ]
  it.each(cases)('%s', async (_name, action, values) => {
    admin = 'not-admin'
    await expect(action(idle, form(values as Record<string, string>))).rejects.toThrow('NOT_FOUND')
    expect(calls).toEqual([])
    expect(recordAudit).not.toHaveBeenCalled()
    expect(onGroupCreated).not.toHaveBeenCalled()
  })
})

describe('createGroup', () => {
  const values = { name: ' Outreach ', slug: 'outreach', description: 'Talks to the public.' }

  it('refuses a slug that is not lowercase words, and a blank name', async () => {
    for (const bad of [{ slug: 'Out Reach' }, { slug: 'out_reach' }, { name: '  ' }]) {
      expect(await createGroup(idle, form({ ...values, ...bad }))).toEqual({ status: 'invalid' })
    }
    expect(calls).toEqual([])
  })

  it('inserts, audits with the slug only, calls the General activity seam and opens the group', async () => {
    respond = () => ({ data: { id: GROUP, slug: 'outreach' }, error: null })
    await expect(createGroup(idle, form(values))).rejects.toThrow(`REDIRECT /admin/groups/${GROUP}`)
    expect(writes()[0]).toMatchObject({
      table: 'working_groups',
      op: 'insert',
      payload: { name: 'Outreach', slug: 'outreach', description: 'Talks to the public.' },
    })
    expect(recordAudit).toHaveBeenCalledWith(
      { service: true },
      {
        actorId: 'admin-1',
        action: 'working_group.created',
        entityType: 'working_group',
        entityId: GROUP,
        details: { slug: 'outreach' },
      },
    )
    expect(onGroupCreated).toHaveBeenCalledWith(GROUP)
  })

  it('reports a taken slug without auditing or calling the seam', async () => {
    respond = () => ({ data: null, error: { code: '23505' } })
    expect(await createGroup(idle, form(values))).toEqual({ status: 'slugTaken' })
    expect(recordAudit).not.toHaveBeenCalled()
    expect(onGroupCreated).not.toHaveBeenCalled()
  })

  it('reports another database failure', async () => {
    respond = () => ({ data: null, error: { code: '42501' } })
    expect(await createGroup(idle, form(values))).toEqual({ status: 'unavailable' })
    expect(recordAudit).not.toHaveBeenCalled()
  })
})

describe('updateGroup', () => {
  const current = {
    slug: 'outreach',
    name: 'Outreach',
    description: 'Words.',
    signal_url: null,
    docs_url: null,
  }
  const values = {
    groupId: GROUP,
    name: 'Outreach',
    description: 'Words.',
    signalUrl: '',
    docsUrl: '',
  }

  it('refuses a link that is not https', async () => {
    const state = await updateGroup(idle, form({ ...values, signalUrl: 'http://example.test' }))
    expect(state).toEqual({ status: 'invalid' })
    expect(calls).toEqual([])
  })

  it('reports a group that does not exist', async () => {
    expect(await updateGroup(idle, form(values))).toEqual({ status: 'notFound' })
    expect(recordAudit).not.toHaveBeenCalled()
  })

  it('writes and audits nothing when no field changed', async () => {
    respond = () => ({ data: current, error: null })
    expect(await updateGroup(idle, form(values))).toEqual({ status: 'done', changed: false })
    expect(writes()).toEqual([])
    expect(recordAudit).not.toHaveBeenCalled()
  })

  it('updates, never touches the slug, and audits the changed field names only', async () => {
    respond = (call) =>
      call.op === 'select' ? { data: current, error: null } : { data: [{ id: GROUP }], error: null }
    const state = await updateGroup(
      idle,
      form({ ...values, name: 'Outreach team', docsUrl: 'https://docs.example.test/x' }),
    )
    expect(state).toEqual({ status: 'done', changed: true })
    expect(writes()[0]?.payload).toEqual({
      name: 'Outreach team',
      description: 'Words.',
      signal_url: null,
      docs_url: 'https://docs.example.test/x',
    })
    expect(recordAudit).toHaveBeenCalledWith(
      { service: true },
      expect.objectContaining({
        action: 'working_group.updated',
        entityId: GROUP,
        details: { slug: 'outreach', fields: ['name', 'docs_url'] },
      }),
    )
  })
})

describe.each([
  ['archiveGroup', archiveGroup, 'working_group.archived', 'is'],
  ['restoreGroup', restoreGroup, 'working_group.restored', 'not'],
] as const)('%s', (_name, action, auditAction, filter) => {
  it('refuses an id that is not a UUID', async () => {
    expect(await action(idle, form({ groupId: 'x' }))).toEqual({ status: 'invalid' })
    expect(calls).toEqual([])
  })

  it('changes a group in the other state and audits it', async () => {
    respond = () => ({ data: [{ id: GROUP, slug: 'outreach' }], error: null })
    expect(await action(idle, form({ groupId: GROUP }))).toEqual({ status: 'done', changed: true })
    expect(writes()[0]?.filters.map(([name]) => name)).toContain(filter)
    expect(recordAudit).toHaveBeenCalledWith(
      { service: true },
      expect.objectContaining({ action: auditAction, details: { slug: 'outreach' } }),
    )
  })

  it('writes no audit entry when the group is already in that state', async () => {
    respond = (call) =>
      call.op === 'update' ? { data: [], error: null } : { data: { id: GROUP }, error: null }
    expect(await action(idle, form({ groupId: GROUP }))).toEqual({ status: 'done', changed: false })
    expect(recordAudit).not.toHaveBeenCalled()
  })

  it('reports a group that does not exist', async () => {
    respond = (call) =>
      call.op === 'update' ? { data: [], error: null } : { data: null, error: null }
    expect(await action(idle, form({ groupId: GROUP }))).toEqual({ status: 'notFound' })
    expect(recordAudit).not.toHaveBeenCalled()
  })
})

describe('addGroupMember', () => {
  const values = { groupId: GROUP, userId: PERSON }
  const lookups = (call: Call): Result | null =>
    call.table === 'working_groups'
      ? { data: { slug: 'outreach' }, error: null }
      : call.table === 'users' && call.op === 'select'
        ? { data: { id: PERSON }, error: null }
        : null

  it('refuses ids that are not UUIDs', async () => {
    expect(await addGroupMember(idle, form({ groupId: GROUP, userId: 'x' }))).toEqual({
      status: 'invalid',
    })
    expect(calls).toEqual([])
  })

  it('adds an active person, records who added them and audits ids only', async () => {
    respond = (call) => lookups(call) ?? { data: null, error: null }
    expect(await addGroupMember(idle, form(values))).toEqual({ status: 'done', changed: true })
    expect(writes()[0]).toMatchObject({
      table: 'wg_members',
      payload: { group_id: GROUP, user_id: PERSON, added_by: 'admin-1' },
    })
    expect(recordAudit).toHaveBeenCalledWith(
      { service: true },
      {
        actorId: 'admin-1',
        action: 'working_group.member_added',
        entityType: 'working_group',
        entityId: GROUP,
        details: { slug: 'outreach', userId: PERSON },
      },
    )
  })

  it('is a quiet no-op when the person is already a member', async () => {
    respond = (call) => lookups(call) ?? { data: null, error: { code: '23505' } }
    expect(await addGroupMember(idle, form(values))).toEqual({ status: 'done', changed: false })
    expect(recordAudit).not.toHaveBeenCalled()
  })

  it('refuses a person who is not an active member and a group that does not exist', async () => {
    respond = (call) =>
      call.table === 'working_groups'
        ? { data: { slug: 'outreach' }, error: null }
        : { data: null, error: null }
    expect(await addGroupMember(idle, form(values))).toEqual({ status: 'notActive' })
    respond = () => ({ data: null, error: null })
    expect(await addGroupMember(idle, form(values))).toEqual({ status: 'notFound' })
    expect(writes()).toEqual([])
    expect(recordAudit).not.toHaveBeenCalled()
  })
})

describe('removeGroupMember', () => {
  const values = { groupId: GROUP, userId: PERSON }

  it('removes the membership and audits ids only', async () => {
    respond = () => ({ data: [{ user_id: PERSON }], error: null })
    expect(await removeGroupMember(idle, form(values))).toEqual({ status: 'done', changed: true })
    expect(writes()[0]).toMatchObject({ table: 'wg_members', op: 'delete' })
    expect(recordAudit).toHaveBeenCalledWith(
      { service: true },
      expect.objectContaining({
        action: 'working_group.member_removed',
        entityId: GROUP,
        details: { userId: PERSON },
      }),
    )
  })

  it('writes no audit entry when the person was not a member', async () => {
    respond = () => ({ data: [], error: null })
    expect(await removeGroupMember(idle, form(values))).toEqual({ status: 'done', changed: false })
    expect(recordAudit).not.toHaveBeenCalled()
  })

  it('reports a failed delete', async () => {
    respond = () => ({ data: null, error: { code: '42501' } })
    expect(await removeGroupMember(idle, form(values))).toEqual({ status: 'unavailable' })
    expect(recordAudit).not.toHaveBeenCalled()
  })
})
