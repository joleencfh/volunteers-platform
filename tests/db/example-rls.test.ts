// Template for every RLS test in this project: build a tiny schema inside a rolled-back
// transaction, then check an allowed case and a denied case for each role.
// Later stories copy this shape for the real tables.
import { afterAll, describe, expect, it } from 'vitest'
import { actAs, inRolledBackTransaction, isDenied, newUserId, sql } from './helpers/db'

afterAll(async () => {
  await sql.end({ timeout: 2 })
})

const EXAMPLE_TABLE = `
  create table public.rls_example (
    id uuid primary key default gen_random_uuid(),
    owner uuid not null,
    note text not null
  );
  alter table public.rls_example enable row level security;
`

describe('RLS test pattern', () => {
  it('lets owners read their own rows and hides them from others and from anon', async () => {
    await inRolledBackTransaction(async (tx) => {
      const alice = newUserId()
      const bob = newUserId()

      await tx.unsafe(`
        ${EXAMPLE_TABLE}
        create policy owner_can_read on public.rls_example
          for select to authenticated using (owner = auth.uid());
        grant select on public.rls_example to authenticated, anon;
      `)
      await tx`insert into public.rls_example (owner, note)
        values (${alice}, 'alice note'), (${bob}, 'bob note')`

      await actAs(tx, { role: 'authenticated', userId: alice })
      const aliceSees = (await tx`select note from public.rls_example`).map((row) => row.note)
      expect(aliceSees).toEqual(['alice note'])

      await actAs(tx, { role: 'authenticated', userId: bob })
      const bobSees = (await tx`select note from public.rls_example`).map((row) => row.note)
      expect(bobSees).toEqual(['bob note'])

      await actAs(tx, { role: 'anon' })
      const anonSees = await tx`select note from public.rls_example`
      expect(anonSees.length).toBe(0)
    })
  })

  it('refuses writes that no grant allows', async () => {
    await inRolledBackTransaction(async (tx) => {
      const alice = newUserId()
      await tx.unsafe(`${EXAMPLE_TABLE} grant select on public.rls_example to authenticated;`)

      await actAs(tx, { role: 'authenticated', userId: alice })
      const denied = await isDenied(
        tx,
        () => tx`insert into public.rls_example (owner, note) values (${alice}, 'x')`,
      )
      expect(denied).toBe(true)
    })
  })

  it('leaves nothing behind after the transaction rolls back', async () => {
    await inRolledBackTransaction(async (tx) => {
      await tx.unsafe('create table public.rls_example (id int)')
    })
    const rows = await sql`select to_regclass('public.rls_example') as name`
    expect(rows[0]?.name).toBeNull()
  })
})
