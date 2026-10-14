// Proves the RLS guard works without Docker, using an in-memory Postgres (PGlite).
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findTablesWithoutRls, type Query } from '../../scripts/rls-guard'

let db: PGlite
const query: Query = async (sql) => (await db.query<{ table_name: string }>(sql)).rows

beforeEach(() => {
  db = new PGlite()
})

afterEach(async () => {
  await db.close()
})

describe('findTablesWithoutRls', () => {
  it('reports nothing for an empty schema', async () => {
    expect(await findTablesWithoutRls(query)).toEqual([])
  })

  it('flags a table without row-level security', async () => {
    await db.exec('create table public.open_table (id int primary key)')
    expect(await findTablesWithoutRls(query)).toEqual(['open_table'])
  })

  it('does not flag a table with row-level security, but still flags the open one', async () => {
    await db.exec(`
      create table public.open_table (id int primary key);
      create table public.closed_table (id int primary key);
      alter table public.closed_table enable row level security;
    `)
    expect(await findTablesWithoutRls(query)).toEqual(['open_table'])
  })

  it('stops flagging a table once row-level security is enabled', async () => {
    await db.exec('create table public.fixed_later (id int primary key)')
    await db.exec('alter table public.fixed_later enable row level security')
    expect(await findTablesWithoutRls(query)).toEqual([])
  })

  it('ignores tables outside the public schema', async () => {
    await db.exec('create schema other; create table other.t (id int)')
    expect(await findTablesWithoutRls(query)).toEqual([])
  })
})

describe('helpers migration', () => {
  it('applies cleanly and set_updated_at refreshes updated_at', async () => {
    const migration = readFileSync('supabase/migrations/20261011151604_helpers.sql', 'utf8')
    await db.exec(migration)
    await db.exec(`
      create table public.touch (id int primary key, updated_at timestamptz not null default '2000-01-01');
      alter table public.touch enable row level security;
      create trigger set_updated_at before update on public.touch
        for each row execute function public.set_updated_at();
      insert into public.touch (id) values (1);
      update public.touch set id = 1 where id = 1;
    `)
    const result = await db.query<{ fresh: boolean }>(
      "select updated_at > now() - interval '1 minute' as fresh from public.touch",
    )
    expect(result.rows[0]?.fresh).toBe(true)
  })
})
