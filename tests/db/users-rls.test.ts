// RLS on public.users and the public.members view. Pattern: tests/db/example-rls.test.ts.
import { afterAll, describe, expect, it } from 'vitest'
import { actAs, inRolledBackTransaction, isDenied, newUserId, sql } from './helpers/db'
import { addAuthUser, addMember } from './helpers/members'

afterAll(async () => {
  await sql.end({ timeout: 2 })
})

describe('users', () => {
  it('denies anon every read and write', async () => {
    await inRolledBackTransaction(async (tx) => {
      const member = await addMember(tx)
      await actAs(tx, { role: 'anon' })
      expect(await isDenied(tx, () => tx`select id from public.users`)).toBe(true)
      expect(
        await isDenied(tx, () => tx`update public.users set level = 'fresh' where id = ${member}`),
      ).toBe(true)
      expect(await isDenied(tx, () => tx`delete from public.users where id = ${member}`)).toBe(true)
    })
  })

  it('lets a member read their own whole row and no other row', async () => {
    await inRolledBackTransaction(async (tx) => {
      const member = await addMember(tx)
      const other = await addMember(tx)
      await actAs(tx, { role: 'authenticated', userId: member })

      const rows = await tx`select id, real_name, email, city from public.users`
      expect(rows.map((row) => row.id)).toEqual([member])
      expect(rows[0]?.real_name).toBe(`Real ${member}`)

      const others = await tx`select id from public.users where id = ${other}`
      expect(others.length).toBe(0)
    })
  })

  it('shows nothing to someone signed in without a member row', async () => {
    await inRolledBackTransaction(async (tx) => {
      await addMember(tx)
      const stranger = await addAuthUser(tx)
      await actAs(tx, { role: 'authenticated', userId: stranger })
      expect((await tx`select id from public.users`).length).toBe(0)
    })
  })

  it('stops a member changing their level or admin flag, or another member', async () => {
    await inRolledBackTransaction(async (tx) => {
      const member = await addMember(tx)
      const other = await addMember(tx)
      await actAs(tx, { role: 'authenticated', userId: member })

      const self = await tx`update public.users set is_admin = true, level = 'experienced'
        where id = ${member}`
      expect(self.count).toBe(0)
      const victim = await tx`update public.users set display_name = 'x' where id = ${other}`
      expect(victim.count).toBe(0)
      expect((await tx`delete from public.users where id = ${other}`).count).toBe(0)

      await actAs(tx, 'superuser')
      const [row] = await tx`select is_admin, level from public.users where id = ${member}`
      expect(row).toMatchObject({ is_admin: false, level: 'new' })
    })
  })

  it('stops a signed-in person inserting their own member row', async () => {
    await inRolledBackTransaction(async (tx) => {
      const stranger = await addAuthUser(tx)
      await actAs(tx, { role: 'authenticated', userId: stranger })
      const denied = await isDenied(
        tx,
        () => tx`insert into public.users (id, display_name, real_name, email)
          values (${stranger}, 'x', 'x', 'x@example.test')`,
      )
      expect(denied).toBe(true)
    })
  })

  it('lets an admin read and write every row', async () => {
    await inRolledBackTransaction(async (tx) => {
      const admin = await addMember(tx, { isAdmin: true })
      const member = await addMember(tx)
      const stranger = await addAuthUser(tx)
      await actAs(tx, { role: 'authenticated', userId: admin })

      expect((await tx`select id from public.users`).length).toBe(2)
      const updated = await tx`update public.users set level = 'fresh' where id = ${member}`
      expect(updated.count).toBe(1)
      await tx`insert into public.users (id, display_name, real_name, email)
        values (${stranger}, 'New', 'New Person', ${`${stranger}@example.test`})`
      expect((await tx`delete from public.users where id = ${stranger}`).count).toBe(1)
    })
  })

  it('gives a deactivated admin no admin rights, only their own row', async () => {
    await inRolledBackTransaction(async (tx) => {
      const former = await addMember(tx, { isAdmin: true, status: 'deactivated' })
      await addMember(tx)
      await actAs(tx, { role: 'authenticated', userId: former })
      const rows = await tx`select id, status from public.users`
      expect(rows.map((row) => row.id)).toEqual([former])
      expect(rows[0]?.status).toBe('deactivated')
    })
  })

  it('keeps emails unique regardless of case', async () => {
    await inRolledBackTransaction(async (tx) => {
      const first = await addAuthUser(tx)
      const second = await addAuthUser(tx)
      await tx`insert into public.users (id, display_name, real_name, email)
        values (${first}, 'One', 'One', 'Same@example.test')`
      const denied = await isDenied(
        tx,
        () => tx`insert into public.users (id, display_name, real_name, email)
          values (${second}, 'Two', 'Two', 'same@EXAMPLE.test')`,
      )
      expect(denied).toBe(true)
    })
  })

  it('defaults a new member to level new, active, English and not an admin', async () => {
    await inRolledBackTransaction(async (tx) => {
      const id = await addAuthUser(tx)
      await tx`insert into public.users (id, display_name, real_name, email)
        values (${id}, 'New', 'New Person', ${`${id}@example.test`})`
      const [row] = await tx`select level, status, locale, is_admin from public.users
        where id = ${id}`
      expect(row).toMatchObject({
        level: 'new',
        status: 'active',
        locale: 'en',
        is_admin: false,
      })
    })
  })

  it('refuses a member row without an auth user', async () => {
    await inRolledBackTransaction(async (tx) => {
      const denied = await isDenied(
        tx,
        () => tx`insert into public.users (id, display_name, real_name, email)
          values (${newUserId()}, 'x', 'x', 'x@example.test')`,
      )
      expect(denied).toBe(true)
    })
  })
})

describe('members view', () => {
  it('denies anon', async () => {
    await inRolledBackTransaction(async (tx) => {
      await addMember(tx)
      await actAs(tx, { role: 'anon' })
      expect(await isDenied(tx, () => tx`select id from public.members`)).toBe(true)
    })
  })

  it('shows a member other active members, with display name and level only', async () => {
    await inRolledBackTransaction(async (tx) => {
      const member = await addMember(tx)
      const other = await addMember(tx, { level: 'fresh' })
      await actAs(tx, { role: 'authenticated', userId: member })

      const rows = await tx`select * from public.members where id = ${other}`
      expect(rows.length).toBe(1)
      expect(Object.keys(rows[0] ?? {}).sort()).toEqual(['display_name', 'id', 'level'])
      expect(rows[0]).toMatchObject({ display_name: `Display ${other}`, level: 'fresh' })
    })
  })

  it.each(['real_name', 'email', 'city', 'is_admin', 'last_login_at'])(
    'does not expose %s',
    async (column) => {
      await inRolledBackTransaction(async (tx) => {
        const member = await addMember(tx)
        await actAs(tx, { role: 'authenticated', userId: member })
        expect(await isDenied(tx, () => tx.unsafe(`select ${column} from public.members`))).toBe(
          true,
        )
      })
    },
  )

  it('shows nothing to someone signed in without a member row', async () => {
    await inRolledBackTransaction(async (tx) => {
      await addMember(tx)
      const stranger = await addAuthUser(tx)
      await actAs(tx, { role: 'authenticated', userId: stranger })
      expect((await tx`select id from public.members`).length).toBe(0)
    })
  })

  it('shows nothing to a deactivated person and hides them from others', async () => {
    await inRolledBackTransaction(async (tx) => {
      const member = await addMember(tx)
      const former = await addMember(tx, { status: 'deactivated' })

      await actAs(tx, { role: 'authenticated', userId: former })
      expect((await tx`select id from public.members`).length).toBe(0)

      await actAs(tx, { role: 'authenticated', userId: member })
      expect((await tx`select id from public.members where id = ${former}`).length).toBe(0)
    })
  })

  it('cannot be written through, even by an admin', async () => {
    await inRolledBackTransaction(async (tx) => {
      const admin = await addMember(tx, { isAdmin: true })
      await actAs(tx, { role: 'authenticated', userId: admin })
      expect(await isDenied(tx, () => tx`update public.members set level = 'experienced'`)).toBe(
        true,
      )
    })
  })
})
