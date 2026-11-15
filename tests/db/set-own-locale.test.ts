// P-03: set_own_locale is the only way a member changes their stored language.
// Pattern: tests/db/example-rls.test.ts.
import { afterAll, describe, expect, it } from 'vitest'
import { actAs, inRolledBackTransaction, isDenied, sql } from './helpers/db'
import { addAuthUser, addMember } from './helpers/members'

afterAll(async () => {
  await sql.end({ timeout: 2 })
})

describe('set_own_locale', () => {
  it('lets an active member set their own locale to en or it', () =>
    inRolledBackTransaction(async (tx) => {
      const member = await addMember(tx)
      await actAs(tx, { role: 'authenticated', userId: member })
      await tx`select public.set_own_locale('it')`
      await actAs(tx, 'superuser')
      expect((await tx`select locale from public.users where id = ${member}`)[0].locale).toBe('it')

      await actAs(tx, { role: 'authenticated', userId: member })
      await tx`select public.set_own_locale('en')`
      await actAs(tx, 'superuser')
      expect((await tx`select locale from public.users where id = ${member}`)[0].locale).toBe('en')
    }))

  it('refuses a value that is not en or it', () =>
    inRolledBackTransaction(async (tx) => {
      const member = await addMember(tx)
      await actAs(tx, { role: 'authenticated', userId: member })
      for (const value of ['fr', '', 'IT', "it'; drop table users;--"]) {
        expect(await isDenied(tx, () => tx`select public.set_own_locale(${value})`), value).toBe(
          true,
        )
      }
      expect(await isDenied(tx, () => tx`select public.set_own_locale(null)`)).toBe(true)
    }))

  it('refuses a non-member and a deactivated member', () =>
    inRolledBackTransaction(async (tx) => {
      const outsider = await addAuthUser(tx)
      const former = await addMember(tx, { status: 'deactivated' })
      for (const userId of [outsider, former]) {
        await actAs(tx, { role: 'authenticated', userId })
        expect(await isDenied(tx, () => tx`select public.set_own_locale('it')`)).toBe(true)
      }
      await actAs(tx, 'superuser')
      expect((await tx`select locale from public.users where id = ${former}`)[0].locale).toBe('en')
    }))

  it('is not available to anon', () =>
    inRolledBackTransaction(async (tx) => {
      await actAs(tx, { role: 'anon' })
      expect(await isDenied(tx, () => tx`select public.set_own_locale('it')`)).toBe(true)
    }))

  it('changes only the caller locale: no other column, no other user', () =>
    inRolledBackTransaction(async (tx) => {
      const member = await addMember(tx, { level: 'fresh' })
      const other = await addMember(tx)
      const before = await tx`select * from public.users where id in (${member}, ${other})`
      await actAs(tx, { role: 'authenticated', userId: member })
      await tx`select public.set_own_locale('it')`
      await actAs(tx, 'superuser')
      const after = await tx`select * from public.users where id in (${member}, ${other})`
      const byId = (rows: typeof before, id: string) => ({
        ...rows.find((row) => row.id === id),
      })
      expect(byId(after, other)).toEqual(byId(before, other))
      expect({ ...byId(after, member), locale: 'x' }).toEqual({
        ...byId(before, member),
        locale: 'x',
      })
      expect(byId(after, member).locale).toBe('it')
    }))
})
