// RLS and constraints on public.applications. Pattern: tests/db/example-rls.test.ts.
import { afterAll, describe, expect, it } from 'vitest'
import { actAs, inRolledBackTransaction, isDenied, sql, type Tx } from './helpers/db'
import { addAuthUser, addMember, insertApplication } from './helpers/members'

afterAll(async () => {
  await sql.end({ timeout: 2 })
})

const heardVia = (tx: Tx, via: string, other: string | null) => () =>
  tx`insert into public.applications (
      display_name, real_name, email, city, heard_via, heard_other,
      privacy_accepted_at, special_category_consent_at, notice_version
    ) values (
      'A', 'A', 'heard@example.test', 'Testville', ${via}, ${other}, now(), now(), 'v1'
    )`

describe('applications', () => {
  it('denies anon reading and inserting directly', async () => {
    await inRolledBackTransaction(async (tx) => {
      await insertApplication(tx)
      await actAs(tx, { role: 'anon' })
      expect(await isDenied(tx, () => tx`select id from public.applications`)).toBe(true)
      expect(await isDenied(tx, () => insertApplication(tx))).toBe(true)
    })
  })

  it('hides applications from members, who cannot write them either', async () => {
    await inRolledBackTransaction(async (tx) => {
      await insertApplication(tx)
      const member = await addMember(tx)
      await actAs(tx, { role: 'authenticated', userId: member })

      expect((await tx`select id from public.applications`).length).toBe(0)
      expect(await isDenied(tx, () => insertApplication(tx))).toBe(true)
      const updated = await tx`update public.applications
        set status = 'approved', decided_at = now()`
      expect(updated.count).toBe(0)
      expect((await tx`delete from public.applications`).count).toBe(0)
    })
  })

  it('hides applications from someone signed in without a member row', async () => {
    await inRolledBackTransaction(async (tx) => {
      await insertApplication(tx)
      const stranger = await addAuthUser(tx)
      await actAs(tx, { role: 'authenticated', userId: stranger })
      expect((await tx`select id from public.applications`).length).toBe(0)
    })
  })

  it('lets an admin read, decide and delete', async () => {
    await inRolledBackTransaction(async (tx) => {
      await insertApplication(tx)
      const admin = await addMember(tx, { isAdmin: true })
      await actAs(tx, { role: 'authenticated', userId: admin })

      expect((await tx`select id from public.applications`).length).toBe(1)
      const updated = await tx`update public.applications
        set status = 'rejected', decided_by = ${admin}, decided_at = now()`
      expect(updated.count).toBe(1)
      expect((await tx`delete from public.applications`).count).toBe(1)
    })
  })

  it('denies a deactivated admin', async () => {
    await inRolledBackTransaction(async (tx) => {
      await insertApplication(tx)
      const former = await addMember(tx, { isAdmin: true, status: 'deactivated' })
      await actAs(tx, { role: 'authenticated', userId: former })
      expect((await tx`select id from public.applications`).length).toBe(0)
    })
  })

  it('lets the service role insert, as the public form does', async () => {
    await inRolledBackTransaction(async (tx) => {
      await actAs(tx, { role: 'service_role' })
      await insertApplication(tx)
      expect((await tx`select id from public.applications`).length).toBe(1)
    })
  })

  it('allows one open application per email, regardless of case', async () => {
    await inRolledBackTransaction(async (tx) => {
      await insertApplication(tx, 'twice@example.test')
      expect(await isDenied(tx, () => insertApplication(tx, 'TWICE@example.test'))).toBe(true)
    })
  })

  it('lets a rejected person apply again', async () => {
    await inRolledBackTransaction(async (tx) => {
      await insertApplication(tx, 'again@example.test')
      await tx`update public.applications set status = 'rejected', decided_at = now()`
      expect(await isDenied(tx, () => insertApplication(tx, 'again@example.test'))).toBe(false)
    })
  })

  it('requires the text for "other" and refuses it for the other sources', async () => {
    await inRolledBackTransaction(async (tx) => {
      expect(await isDenied(tx, heardVia(tx, 'other', null))).toBe(true)
      expect(await isDenied(tx, heardVia(tx, 'other', '  '))).toBe(true)
      expect(await isDenied(tx, heardVia(tx, 'word_of_mouth', 'friend'))).toBe(true)
      expect(await isDenied(tx, heardVia(tx, 'other', 'a poster'))).toBe(false)
    })
  })

  it('keeps the decision time in step with the status', async () => {
    await inRolledBackTransaction(async (tx) => {
      await insertApplication(tx)
      expect(await isDenied(tx, () => tx`update public.applications set status = 'approved'`)).toBe(
        true,
      )
      expect(await isDenied(tx, () => tx`update public.applications set decided_at = now()`)).toBe(
        true,
      )
    })
  })
})
