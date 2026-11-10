// P-03: data_requests rules. Every rule has an allowed and a denied case.
// Pattern: tests/db/example-rls.test.ts.
import { afterAll, describe, expect, it } from 'vitest'
import { actAs, inRolledBackTransaction, isDenied, sql, type Tx } from './helpers/db'
import { addAuthUser, addMember } from './helpers/members'

afterAll(async () => {
  await sql.end({ timeout: 2 })
})

async function addRequest(tx: Tx, userId: string, kind = 'export'): Promise<string> {
  const rows = await tx`
    insert into public.data_requests (user_id, kind) values (${userId}, ${kind}) returning id`
  return rows[0].id as string
}

describe('data_requests insert', () => {
  it('lets an active member file a request for themselves', () =>
    inRolledBackTransaction(async (tx) => {
      const member = await addMember(tx)
      await actAs(tx, { role: 'authenticated', userId: member })
      await tx`insert into public.data_requests (user_id, kind) values (${member}, 'deletion')`
      const rows = await tx`select kind, status, handled_at, handled_by from public.data_requests`
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        kind: 'deletion',
        status: 'open',
        handled_at: null,
        handled_by: null,
      })
    }))

  it('refuses a request for another user', () =>
    inRolledBackTransaction(async (tx) => {
      const member = await addMember(tx)
      const other = await addMember(tx)
      await actAs(tx, { role: 'authenticated', userId: member })
      expect(
        await isDenied(
          tx,
          () => tx`insert into public.data_requests (user_id, kind) values (${other}, 'export')`,
        ),
      ).toBe(true)
    }))

  it('refuses a request that is already marked done or carries a handler', () =>
    inRolledBackTransaction(async (tx) => {
      const member = await addMember(tx)
      await actAs(tx, { role: 'authenticated', userId: member })
      expect(
        await isDenied(
          tx,
          () =>
            tx`insert into public.data_requests (user_id, kind, status)
               values (${member}, 'export', 'done')`,
        ),
      ).toBe(true)
      expect(
        await isDenied(
          tx,
          () =>
            tx`insert into public.data_requests (user_id, kind, handled_by)
               values (${member}, 'export', ${member})`,
        ),
      ).toBe(true)
    }))

  it('blocks a second open request of the same kind but allows the other kind', () =>
    inRolledBackTransaction(async (tx) => {
      const member = await addMember(tx)
      await actAs(tx, { role: 'authenticated', userId: member })
      await tx`insert into public.data_requests (user_id, kind) values (${member}, 'export')`
      const duplicate = await tx
        .savepoint(
          async (sp) =>
            sp`insert into public.data_requests (user_id, kind) values (${member}, 'export')`,
        )
        .then(
          () => null,
          (error: { code?: string }) => error.code,
        )
      expect(duplicate).toBe('23505')
      await tx`insert into public.data_requests (user_id, kind) values (${member}, 'deletion')`
    }))

  it('allows a new request once the earlier one is done', () =>
    inRolledBackTransaction(async (tx) => {
      const member = await addMember(tx)
      const first = await addRequest(tx, member)
      await tx`update public.data_requests set status = 'done' where id = ${first}`
      await actAs(tx, { role: 'authenticated', userId: member })
      await tx`insert into public.data_requests (user_id, kind) values (${member}, 'export')`
    }))

  it('refuses a deactivated member, a non-member and anon', () =>
    inRolledBackTransaction(async (tx) => {
      const former = await addMember(tx, { status: 'deactivated' })
      const outsider = await addAuthUser(tx)
      for (const userId of [former, outsider]) {
        await actAs(tx, { role: 'authenticated', userId })
        expect(
          await isDenied(
            tx,
            () => tx`insert into public.data_requests (user_id, kind) values (${userId}, 'export')`,
          ),
        ).toBe(true)
      }
      const member = await addMember(tx)
      await actAs(tx, { role: 'anon' })
      expect(
        await isDenied(
          tx,
          () => tx`insert into public.data_requests (user_id, kind) values (${member}, 'export')`,
        ),
      ).toBe(true)
    }))
})

describe('data_requests select', () => {
  it('shows a member their own requests and nobody else is visible to them', () =>
    inRolledBackTransaction(async (tx) => {
      const member = await addMember(tx)
      const other = await addMember(tx)
      const mine = await addRequest(tx, member)
      await addRequest(tx, other)
      await actAs(tx, { role: 'authenticated', userId: member })
      const rows = await tx`select id from public.data_requests`
      expect(rows.map((row) => row.id)).toEqual([mine])
    }))

  it('shows an admin every request', () =>
    inRolledBackTransaction(async (tx) => {
      const admin = await addMember(tx, { isAdmin: true })
      const a = await addRequest(tx, await addMember(tx))
      const b = await addRequest(tx, await addMember(tx), 'deletion')
      await actAs(tx, { role: 'authenticated', userId: admin })
      const rows = await tx`select id from public.data_requests`
      expect(rows.map((row) => row.id).sort()).toEqual([a, b].sort())
    }))

  it('shows nothing to a deactivated member, a non-member and anon', () =>
    inRolledBackTransaction(async (tx) => {
      const former = await addMember(tx, { status: 'deactivated' })
      const outsider = await addAuthUser(tx)
      await addRequest(tx, former)
      for (const userId of [former, outsider]) {
        await actAs(tx, { role: 'authenticated', userId })
        expect(await tx`select id from public.data_requests`).toHaveLength(0)
      }
      await actAs(tx, { role: 'anon' })
      expect(await isDenied(tx, () => tx`select id from public.data_requests`)).toBe(true)
    }))
})

describe('data_requests update', () => {
  it('lets an admin mark any request handled', () =>
    inRolledBackTransaction(async (tx) => {
      const admin = await addMember(tx, { isAdmin: true })
      const id = await addRequest(tx, await addMember(tx))
      await actAs(tx, { role: 'authenticated', userId: admin })
      await tx`
        update public.data_requests
        set status = 'done', handled_at = now(), handled_by = ${admin} where id = ${id}`
      await actAs(tx, 'superuser')
      const rows = await tx`select status, handled_by from public.data_requests where id = ${id}`
      expect(rows[0]).toMatchObject({ status: 'done', handled_by: admin })
    }))

  it('does not let an admin change the owner or kind of a request', () =>
    inRolledBackTransaction(async (tx) => {
      const admin = await addMember(tx, { isAdmin: true })
      const other = await addMember(tx)
      const id = await addRequest(tx, await addMember(tx))
      await actAs(tx, { role: 'authenticated', userId: admin })
      expect(
        await isDenied(
          tx,
          () => tx`update public.data_requests set user_id = ${other} where id = ${id}`,
        ),
      ).toBe(true)
      expect(
        await isDenied(
          tx,
          () => tx`update public.data_requests set kind = 'deletion' where id = ${id}`,
        ),
      ).toBe(true)
    }))

  it('does not let a member update or delete their own request', () =>
    inRolledBackTransaction(async (tx) => {
      const member = await addMember(tx)
      const id = await addRequest(tx, member)
      await actAs(tx, { role: 'authenticated', userId: member })
      // Updates and deletes are filtered by row-level security (or refused by grants): the row
      // must be unchanged either way.
      await isDenied(tx, () => tx`update public.data_requests set status = 'done' where id = ${id}`)
      await isDenied(tx, () => tx`delete from public.data_requests where id = ${id}`)
      await actAs(tx, 'superuser')
      const rows = await tx`select status from public.data_requests where id = ${id}`
      expect(rows).toHaveLength(1)
      expect(rows[0].status).toBe('open')
    }))
})
