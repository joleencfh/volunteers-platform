import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

let signedIn = true
let allowed = true
const order: string[] = []
const requireWgMember = vi.fn()
vi.mock('@/lib/authz', () => ({
  requireUser: async () => {
    order.push('requireUser')
    if (!signedIn) throw new Error('REDIRECT /login')
    return { id: 'member-1' }
  },
}))
vi.mock('@/lib/authz/wg', () => ({
  requireWgMember: async (groupId: string, minLevel?: string) => {
    order.push('requireWgMember')
    requireWgMember(groupId, minLevel)
    if (!allowed) throw new Error('NOT_FOUND')
    return { member: { id: 'member-1' }, membership: null }
  },
}))

const writes = vi.fn()
let result: { data: { id: string }[] | null; error: { code: string } | null } = {
  data: [{ id: 'row' }],
  error: null,
}

/** A chainable query builder that records the write and the filters, and resolves to `result`. */
function builder(table: string, kind: string, payload?: unknown) {
  const filters: Record<string, string> = {}
  const query = {
    eq: (column: string, value: string) => {
      filters[column] = value
      return query
    },
    select: () => query,
    then: (resolve: (value: typeof result) => unknown) => {
      order.push(kind)
      writes(table, kind, payload, filters)
      return Promise.resolve(result).then(resolve)
    },
  }
  return query
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => ({
      insert: (payload: unknown) => builder(table, 'insert', payload),
      update: (payload: unknown) => builder(table, 'update', payload),
      delete: () => builder(table, 'delete'),
    }),
  }),
}))

import {
  addMeeting,
  deleteMeeting,
  updateGroupLinks,
  updateMeeting,
} from '@/app/[lang]/groups/[slug]/meetings-actions'

const GROUP = '8b1c2f3e-4d5a-4b6c-8d7e-9f0a1b2c3d4e'
const MEETING = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
const idle = { status: 'idle' as const }

const form = (values: Record<string, string>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}
const meeting = (extra: Record<string, string> = {}) =>
  form({
    groupId: GROUP,
    startsAt: '2026-07-15T20:30',
    meetingUrl: 'https://meet.example.test/room',
    agendaUrl: '',
    ...extra,
  })

beforeEach(() => {
  vi.clearAllMocks()
  order.length = 0
  signedIn = true
  allowed = true
  result = { data: [{ id: 'row' }], error: null }
})

describe('addMeeting', () => {
  it('requires a signed-in member before anything else', async () => {
    signedIn = false
    await expect(addMeeting(idle, meeting())).rejects.toThrow('REDIRECT')
    expect(requireWgMember).not.toHaveBeenCalled()
    expect(writes).not.toHaveBeenCalled()
  })

  it('refuses malformed input without checking the group or writing', async () => {
    const cases: Record<string, string>[] = [
      { groupId: 'x' },
      { startsAt: 'soon' },
      { meetingUrl: 'http://meet.example.test' },
      { agendaUrl: 'nope' },
    ]
    for (const extra of cases) {
      expect(await addMeeting(idle, meeting(extra))).toEqual({ status: 'invalid' })
    }
    expect(requireWgMember).not.toHaveBeenCalled()
    expect(writes).not.toHaveBeenCalled()
  })

  it('asks for a fresh member of the group, and writes nothing when refused', async () => {
    allowed = false
    await expect(addMeeting(idle, meeting())).rejects.toThrow('NOT_FOUND')
    expect(requireWgMember).toHaveBeenCalledWith(GROUP, 'fresh')
    expect(writes).not.toHaveBeenCalled()
    expect(order).toEqual(['requireUser', 'requireWgMember'])
  })

  it('inserts the meeting as a UTC instant, created by the caller', async () => {
    expect(await addMeeting(idle, meeting())).toEqual({ status: 'added' })
    expect(writes).toHaveBeenCalledWith(
      'wg_meetings',
      'insert',
      {
        group_id: GROUP,
        starts_at: '2026-07-15T18:30:00.000Z',
        meeting_url: 'https://meet.example.test/room',
        agenda_url: null,
        created_by: 'member-1',
      },
      {},
    )
  })

  it('maps a policy refusal and any other failure to typed states', async () => {
    result = { data: null, error: { code: '42501' } }
    expect(await addMeeting(idle, meeting())).toEqual({ status: 'notAllowed' })
    result = { data: null, error: { code: 'XX000' } }
    expect(await addMeeting(idle, meeting())).toEqual({ status: 'unavailable' })
  })
})

describe('updateMeeting', () => {
  const input = (extra: Record<string, string> = {}) => meeting({ meetingId: MEETING, ...extra })

  it('requires a signed-in member and a fresh member of the group first', async () => {
    signedIn = false
    await expect(updateMeeting(idle, input())).rejects.toThrow('REDIRECT')
    signedIn = true
    allowed = false
    await expect(updateMeeting(idle, input())).rejects.toThrow('NOT_FOUND')
    expect(requireWgMember).toHaveBeenCalledWith(GROUP, 'fresh')
    expect(writes).not.toHaveBeenCalled()
  })

  it('refuses malformed input', async () => {
    expect(await updateMeeting(idle, input({ meetingId: 'x' }))).toEqual({ status: 'invalid' })
    expect(await updateMeeting(idle, input({ meetingUrl: 'x' }))).toEqual({ status: 'invalid' })
    expect(writes).not.toHaveBeenCalled()
  })

  it('updates only the meeting of that group', async () => {
    expect(await updateMeeting(idle, input())).toEqual({ status: 'updated' })
    expect(writes).toHaveBeenCalledWith(
      'wg_meetings',
      'update',
      {
        starts_at: '2026-07-15T18:30:00.000Z',
        meeting_url: 'https://meet.example.test/room',
        agenda_url: null,
      },
      { id: MEETING, group_id: GROUP },
    )
  })

  it('reports a meeting that is not there, and maps failures', async () => {
    result = { data: [], error: null }
    expect(await updateMeeting(idle, input())).toEqual({ status: 'notFound' })
    result = { data: null, error: { code: '42501' } }
    expect(await updateMeeting(idle, input())).toEqual({ status: 'notAllowed' })
    result = { data: null, error: { code: 'XX000' } }
    expect(await updateMeeting(idle, input())).toEqual({ status: 'unavailable' })
  })
})

describe('deleteMeeting', () => {
  const input = () => form({ groupId: GROUP, meetingId: MEETING })

  it('requires a signed-in member and a fresh member of the group first', async () => {
    signedIn = false
    await expect(deleteMeeting(idle, input())).rejects.toThrow('REDIRECT')
    signedIn = true
    allowed = false
    await expect(deleteMeeting(idle, input())).rejects.toThrow('NOT_FOUND')
    expect(requireWgMember).toHaveBeenCalledWith(GROUP, 'fresh')
    expect(writes).not.toHaveBeenCalled()
  })

  it('refuses malformed input', async () => {
    expect(await deleteMeeting(idle, form({ groupId: GROUP, meetingId: 'x' }))).toEqual({
      status: 'invalid',
    })
    expect(writes).not.toHaveBeenCalled()
  })

  it('deletes only the meeting of that group', async () => {
    expect(await deleteMeeting(idle, input())).toEqual({ status: 'deleted' })
    expect(writes).toHaveBeenCalledWith('wg_meetings', 'delete', undefined, {
      id: MEETING,
      group_id: GROUP,
    })
  })

  it('reports a meeting that is not there, and maps failures', async () => {
    result = { data: [], error: null }
    expect(await deleteMeeting(idle, input())).toEqual({ status: 'notFound' })
    result = { data: null, error: { code: '42501' } }
    expect(await deleteMeeting(idle, input())).toEqual({ status: 'notAllowed' })
    result = { data: null, error: { code: 'XX000' } }
    expect(await deleteMeeting(idle, input())).toEqual({ status: 'unavailable' })
  })
})

describe('updateGroupLinks', () => {
  const input = (extra: Record<string, string> = {}) =>
    form({
      groupId: GROUP,
      signalUrl: 'https://signal.group/#synthetic',
      docsUrl: 'https://docs.example.test/d',
      ...extra,
    })

  it('requires a signed-in member and a fresh member of the group first', async () => {
    signedIn = false
    await expect(updateGroupLinks(idle, input())).rejects.toThrow('REDIRECT')
    signedIn = true
    allowed = false
    await expect(updateGroupLinks(idle, input())).rejects.toThrow('NOT_FOUND')
    expect(requireWgMember).toHaveBeenCalledWith(GROUP, 'fresh')
    expect(writes).not.toHaveBeenCalled()
  })

  it('refuses a link that is not https', async () => {
    expect(await updateGroupLinks(idle, input({ signalUrl: 'http://x.test' }))).toEqual({
      status: 'invalid',
    })
    expect(writes).not.toHaveBeenCalled()
  })

  it('sets both links and changes nothing else', async () => {
    expect(await updateGroupLinks(idle, input())).toEqual({ status: 'saved' })
    expect(writes).toHaveBeenCalledWith(
      'working_groups',
      'update',
      { signal_url: 'https://signal.group/#synthetic', docs_url: 'https://docs.example.test/d' },
      { id: GROUP },
    )
  })

  it('clears a link left blank', async () => {
    expect(await updateGroupLinks(idle, input({ signalUrl: '', docsUrl: '' }))).toEqual({
      status: 'saved',
    })
    expect(writes).toHaveBeenCalledWith(
      'working_groups',
      'update',
      { signal_url: null, docs_url: null },
      { id: GROUP },
    )
  })

  it('reports a missing group, and maps failures', async () => {
    result = { data: [], error: null }
    expect(await updateGroupLinks(idle, input())).toEqual({ status: 'notFound' })
    result = { data: null, error: { code: '42501' } }
    expect(await updateGroupLinks(idle, input())).toEqual({ status: 'notAllowed' })
    result = { data: null, error: { code: 'XX000' } }
    expect(await updateGroupLinks(idle, input())).toEqual({ status: 'unavailable' })
  })
})
