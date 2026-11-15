// W-03: decide_join_request and pending_join_request_count. Pattern: tests/db/working-groups-rls.test.ts.
// Spec section 3 (request and approve rows) and section 5. Run in CI against local Supabase.
import { afterAll, describe, expect, it } from 'vitest'
import { actAs, inRolledBackTransaction, isDenied, sql, type Tx } from './helpers/db'
import { addGroup, addToGroup, as } from './helpers/groups'
import { addMember } from './helpers/members'

afterAll(async () => {
  await sql.end({ timeout: 2 })
})

type Level = 'new' | 'fresh' | 'experienced'

/** A group with one member per level, a requester with a pending request, and some bystanders. */
async function setup(tx: Tx) {
  const group = await addGroup(tx)
  const members: Record<Level, string> = {
    new: await addMember(tx, { level: 'new' }),
    fresh: await addMember(tx, { level: 'fresh' }),
    experienced: await addMember(tx, { level: 'experienced' }),
  }
  await addToGroup(tx, group, ...Object.values(members))
  const freshOutsider = await addMember(tx, { level: 'fresh' })
  const outsider = await addMember(tx, { level: 'new' })
  const admin = await addMember(tx, { isAdmin: true })
  const requester = await addMember(tx)
  const [request] = await tx`
    insert into public.wg_join_requests (group_id, user_id) values (${group}, ${requester})
    returning id`
  return {
    group,
    members,
    freshOutsider,
    outsider,
    admin,
    requester,
    request: request?.id as string,
  }
}

type World = Awaited<ReturnType<typeof setup>>

const decide = (tx: Tx, id: string, approve: boolean) =>
  tx`select public.decide_join_request(${id}, ${approve}) as status`

const askToJoin = (tx: Tx, group: string, user: string) =>
  tx`insert into public.wg_join_requests (group_id, user_id) values (${group}, ${user})`

describe('decide_join_request', () => {
  it.each(['fresh', 'experienced'] as const)('lets a %s member of the group approve', (level) =>
    inRolledBackTransaction(async (tx) => {
      const w = await setup(tx)
      await as(tx, w.members[level])
      const [row] = await decide(tx, w.request, true)
      expect(row?.status).toBe('approved')
      await actAs(tx, 'superuser')
      const rows = await tx`
        select added_by from public.wg_members
        where group_id = ${w.group} and user_id = ${w.requester}`
      expect(rows).toHaveLength(1)
      expect(rows[0]?.added_by).toBe(w.members[level])
      const [req] = await tx`
        select status, decided_by, decided_at from public.wg_join_requests where id = ${w.request}`
      expect(req).toMatchObject({ status: 'approved', decided_by: w.members[level] })
      expect(req?.decided_at).not.toBeNull()
    }),
  )

  it('lets an admin approve without belonging to the group', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await setup(tx)
      await as(tx, w.admin)
      const [row] = await decide(tx, w.request, true)
      expect(row?.status).toBe('approved')
    }))

  it('lets an approver reject, and adds no membership', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await setup(tx)
      await as(tx, w.members.fresh)
      const [row] = await decide(tx, w.request, false)
      expect(row?.status).toBe('rejected')
      await actAs(tx, 'superuser')
      const rows = await tx`
        select 1 from public.wg_members where group_id = ${w.group} and user_id = ${w.requester}`
      expect(rows).toHaveLength(0)
    }))

  it.each<[string, (w: World) => string]>([
    ['a new member of the group', (w) => w.members.new],
    ['a fresh member of another group', (w) => w.freshOutsider],
    ['an outsider', (w) => w.outsider],
    ['the requester', (w) => w.requester],
  ])('refuses %s and leaves the request pending', (_name, who) =>
    inRolledBackTransaction(async (tx) => {
      const w = await setup(tx)
      await as(tx, who(w))
      expect(await isDenied(tx, () => decide(tx, w.request, true))).toBe(true)
      await actAs(tx, 'superuser')
      const [req] = await tx`select status from public.wg_join_requests where id = ${w.request}`
      expect(req?.status).toBe('pending')
      const rows = await tx`select 1 from public.wg_members where user_id = ${w.requester}`
      expect(rows).toHaveLength(0)
    }),
  )

  it('refuses anon', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await setup(tx)
      await actAs(tx, { role: 'anon' })
      expect(await isDenied(tx, () => decide(tx, w.request, true))).toBe(true)
    }))

  it('refuses a deactivated approver', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await setup(tx)
      await tx`update public.users set status = 'deactivated' where id = ${w.members.experienced}`
      await as(tx, w.members.experienced)
      expect(await isDenied(tx, () => decide(tx, w.request, true))).toBe(true)
    }))

  it('refuses a request that is already decided', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await setup(tx)
      await as(tx, w.members.fresh)
      await decide(tx, w.request, false)
      expect(await isDenied(tx, () => decide(tx, w.request, true))).toBe(true)
    }))

  it('refuses a request for an archived group', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await setup(tx)
      await tx`update public.working_groups set archived_at = now() where id = ${w.group}`
      await as(tx, w.admin)
      expect(await isDenied(tx, () => decide(tx, w.request, true))).toBe(true)
    }))

  it('refuses an unknown request', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await setup(tx)
      await as(tx, w.admin)
      const unknown = '00000000-0000-4000-8000-000000000000'
      expect(await isDenied(tx, () => decide(tx, unknown, true))).toBe(true)
    }))

  it('adds no second membership if the person became a member while the request waited', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await setup(tx)
      await addToGroup(tx, w.group, w.requester)
      await as(tx, w.members.fresh)
      const [row] = await decide(tx, w.request, true)
      expect(row?.status).toBe('approved')
      await actAs(tx, 'superuser')
      const rows = await tx`
        select added_by from public.wg_members
        where group_id = ${w.group} and user_id = ${w.requester}`
      expect(rows).toHaveLength(1)
      expect(rows[0]?.added_by).toBeNull()
    }))
})

describe('requests', () => {
  it('blocks a second pending request for the same group', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await setup(tx)
      await as(tx, w.requester)
      expect(await isDenied(tx, () => askToJoin(tx, w.group, w.requester))).toBe(true)
    }))

  it('lets a rejected person request again', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await setup(tx)
      await as(tx, w.members.fresh)
      await decide(tx, w.request, false)
      await as(tx, w.requester)
      expect(await isDenied(tx, () => askToJoin(tx, w.group, w.requester))).toBe(false)
    }))

  it('does not let an admin request to join', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await setup(tx)
      await as(tx, w.admin)
      expect(await isDenied(tx, () => askToJoin(tx, w.group, w.admin))).toBe(true)
    }))

  it('does not let a member of the group request to join it again', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await setup(tx)
      await as(tx, w.members.new)
      expect(await isDenied(tx, () => askToJoin(tx, w.group, w.members.new))).toBe(true)
    }))
})

describe('pending_join_request_count', () => {
  const count = async (tx: Tx, who: string) => {
    await as(tx, who)
    const [row] = await tx`select public.pending_join_request_count() as n`
    return row?.n
  }

  it('counts the pending requests an approver may decide', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await setup(tx)
      expect(await count(tx, w.members.fresh)).toBe(1)
      expect(await count(tx, w.members.experienced)).toBe(1)
      expect(await count(tx, w.admin)).toBe(1)
    }))

  it('counts nothing for a new member, a fresh member of another group and an outsider', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await setup(tx)
      expect(await count(tx, w.members.new)).toBe(0)
      expect(await count(tx, w.freshOutsider)).toBe(0)
      expect(await count(tx, w.outsider)).toBe(0)
    }))

  it('stops counting a request once it is decided', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await setup(tx)
      await as(tx, w.members.fresh)
      await decide(tx, w.request, false)
      expect(await count(tx, w.admin)).toBe(0)
    }))

  it('is not available to anon', () =>
    inRolledBackTransaction(async (tx) => {
      await setup(tx)
      await actAs(tx, { role: 'anon' })
      expect(await isDenied(tx, () => tx`select public.pending_join_request_count()`)).toBe(true)
    }))
})
