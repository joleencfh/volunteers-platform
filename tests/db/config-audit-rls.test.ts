// RLS on public.config and public.audit_log, and the config seed.
// Pattern: tests/db/example-rls.test.ts.
import { afterAll, describe, expect, it } from 'vitest'
import { actAs, inRolledBackTransaction, isDenied, sql, type Tx } from './helpers/db'
import { addAuthUser, addMember } from './helpers/members'

afterAll(async () => {
  await sql.end({ timeout: 2 })
})

describe('config', () => {
  it('is seeded with the spec values', async () => {
    const rows = await sql`select key, value from public.config`
    expect(Object.fromEntries(rows.map((row) => [row.key, row.value]))).toEqual({
      'level.new_to_fresh.completed_tasks': 3,
      'level.fresh_to_experienced.activities_as_participant': 7,
      'level.fresh_to_experienced.completed_tasks': 20,
      'level.fresh_to_experienced.times_as_wg_lead': 3,
      'level.fresh_to_experienced.months_since_joining': 2,
      'onboarding.welcome_document_url': '',
      'retention.rejected_applications_months': 6,
      'retention.people_who_leave_months': 12,
    })
  })

  it('denies anon', async () => {
    await inRolledBackTransaction(async (tx) => {
      await actAs(tx, { role: 'anon' })
      expect(await isDenied(tx, () => tx`select key from public.config`)).toBe(true)
      expect(await isDenied(tx, () => tx`update public.config set value = '1'`)).toBe(true)
    })
  })

  it('lets a member read but not write', async () => {
    await inRolledBackTransaction(async (tx) => {
      const member = await addMember(tx)
      await actAs(tx, { role: 'authenticated', userId: member })

      expect((await tx`select key from public.config`).length).toBeGreaterThan(0)
      expect((await tx`update public.config set value = '1'`).count).toBe(0)
      expect((await tx`delete from public.config`).count).toBe(0)
      expect(
        await isDenied(
          tx,
          () => tx`insert into public.config (key, value, description)
            values ('x', '1', 'x')`,
        ),
      ).toBe(true)
    })
  })

  it('shows nothing to someone signed in without a member row or deactivated', async () => {
    await inRolledBackTransaction(async (tx) => {
      const stranger = await addAuthUser(tx)
      const former = await addMember(tx, { status: 'deactivated' })

      await actAs(tx, { role: 'authenticated', userId: stranger })
      expect((await tx`select key from public.config`).length).toBe(0)

      await actAs(tx, { role: 'authenticated', userId: former })
      expect((await tx`select key from public.config`).length).toBe(0)
    })
  })

  it('lets an admin change a value', async () => {
    await inRolledBackTransaction(async (tx) => {
      const admin = await addMember(tx, { isAdmin: true })
      await actAs(tx, { role: 'authenticated', userId: admin })
      const updated = await tx`update public.config set value = '5'
        where key = 'level.new_to_fresh.completed_tasks'`
      expect(updated.count).toBe(1)
    })
  })
})

describe('audit_log', () => {
  const insertEntry = (tx: Tx) =>
    tx`insert into public.audit_log (action, entity_type) values ('test.action', 'test')`

  it('denies anon', async () => {
    await inRolledBackTransaction(async (tx) => {
      await actAs(tx, { role: 'anon' })
      expect(await isDenied(tx, () => tx`select id from public.audit_log`)).toBe(true)
      expect(await isDenied(tx, () => insertEntry(tx))).toBe(true)
    })
  })

  it('hides entries from members, who cannot write them either', async () => {
    await inRolledBackTransaction(async (tx) => {
      await insertEntry(tx)
      const member = await addMember(tx)
      await actAs(tx, { role: 'authenticated', userId: member })

      expect((await tx`select id from public.audit_log`).length).toBe(0)
      expect(await isDenied(tx, () => insertEntry(tx))).toBe(true)
    })
  })

  it('lets an admin read but not write, change or delete', async () => {
    await inRolledBackTransaction(async (tx) => {
      await insertEntry(tx)
      const admin = await addMember(tx, { isAdmin: true })
      await actAs(tx, { role: 'authenticated', userId: admin })

      expect((await tx`select id from public.audit_log`).length).toBe(1)
      expect(await isDenied(tx, () => insertEntry(tx))).toBe(true)
      expect(await isDenied(tx, () => tx`update public.audit_log set action = 'x'`)).toBe(true)
      expect(await isDenied(tx, () => tx`delete from public.audit_log`)).toBe(true)
    })
  })

  it('lets the service role append but not change or delete', async () => {
    await inRolledBackTransaction(async (tx) => {
      await actAs(tx, { role: 'service_role' })
      await insertEntry(tx)
      expect((await tx`select id from public.audit_log`).length).toBe(1)
      expect(await isDenied(tx, () => tx`update public.audit_log set action = 'x'`)).toBe(true)
      expect(await isDenied(tx, () => tx`delete from public.audit_log`)).toBe(true)
    })
  })
})
