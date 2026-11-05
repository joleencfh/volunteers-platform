// The query behind lib/authz findMember, run as the person signing in. Pattern: example-rls.test.ts.
import { afterAll, describe, expect, it } from 'vitest'
import { actAs, inRolledBackTransaction, sql } from './helpers/db'
import { addAuthUser, addMember } from './helpers/members'

afterAll(async () => {
  await sql.end({ timeout: 2 })
})

describe('sign-in membership lookup', () => {
  it('lets an active member read their own row, with the admin flag from the database', async () => {
    await inRolledBackTransaction(async (tx) => {
      const admin = await addMember(tx, { isAdmin: true })
      await actAs(tx, { role: 'authenticated', userId: admin })
      const [row] =
        await tx`select id, email, is_admin, status from public.users where id = ${admin}`
      expect(row).toMatchObject({ id: admin, is_admin: true, status: 'active' })
    })
  })

  it('shows a deactivated user their status, so the application can refuse them', async () => {
    await inRolledBackTransaction(async (tx) => {
      const gone = await addMember(tx, { status: 'deactivated', isAdmin: true })
      await actAs(tx, { role: 'authenticated', userId: gone })
      const [row] = await tx`select status from public.users where id = ${gone}`
      expect(row?.status).toBe('deactivated')
      const [admin] = await tx`select public.is_admin() as is_admin`
      expect(admin?.is_admin).toBe(false)
    })
  })

  it('finds nothing for a signed-in person with no member record, or for another id', async () => {
    await inRolledBackTransaction(async (tx) => {
      const member = await addMember(tx)
      const stranger = await addAuthUser(tx)
      await actAs(tx, { role: 'authenticated', userId: stranger })
      expect((await tx`select id from public.users where id = ${stranger}`).length).toBe(0)
      expect((await tx`select id from public.users where id = ${member}`).length).toBe(0)
    })
  })
})
