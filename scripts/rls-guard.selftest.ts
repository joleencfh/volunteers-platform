// Proves the RLS guard works, without Docker: runs it against an in-memory Postgres (PGlite).
// F-04 turns this into a Vitest test; until then it runs as a plain script from `test:db`.
import { PGlite } from '@electric-sql/pglite'
import assert from 'node:assert/strict'
import { findTablesWithoutRls, type Query } from './rls-guard'

const db = new PGlite()
const query: Query = async (sql) => (await db.query<{ table_name: string }>(sql)).rows

// Start from a clean schema: nothing to report.
assert.deepEqual(await findTablesWithoutRls(query), [], 'empty schema has no offenders')

// A table without RLS must be reported.
await db.exec('create table public.selftest_open (id int primary key)')
assert.deepEqual(await findTablesWithoutRls(query), ['selftest_open'], 'open table is flagged')

// A table with RLS enabled must not be reported, and the open one still is.
await db.exec(`
  create table public.selftest_closed (id int primary key);
  alter table public.selftest_closed enable row level security;
`)
assert.deepEqual(
  await findTablesWithoutRls(query),
  ['selftest_open'],
  'closed table is not flagged, open table still is',
)

// Fixing the open table clears the report.
await db.exec('alter table public.selftest_open enable row level security')
assert.deepEqual(await findTablesWithoutRls(query), [], 'fixed table is no longer flagged')

// Tables outside schema public are ignored.
await db.exec('create schema other; create table other.t (id int)')
assert.deepEqual(await findTablesWithoutRls(query), [], 'other schemas are ignored')

// The helper migration applies cleanly and its trigger function works.
const { readFileSync } = await import('node:fs')
await db.exec(readFileSync('supabase/migrations/20261011151604_helpers.sql', 'utf8'))
await db.exec(`
  create table public.selftest_touch (id int primary key, updated_at timestamptz not null default '2000-01-01');
  alter table public.selftest_touch enable row level security;
  create trigger set_updated_at before update on public.selftest_touch
    for each row execute function public.set_updated_at();
  insert into public.selftest_touch (id) values (1);
  update public.selftest_touch set id = 1 where id = 1;
`)
const touched = await db.query<{ fresh: boolean }>(
  "select updated_at > now() - interval '1 minute' as fresh from public.selftest_touch",
)
assert.equal(touched.rows[0]?.fresh, true, 'set_updated_at refreshes updated_at')

await db.close()
console.log('RLS guard self-test passed.')
