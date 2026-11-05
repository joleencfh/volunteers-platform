// Applies every migration to an in-memory Postgres (PGlite), so a broken migration or a table
// without row-level security shows up locally. CI repeats this against real Supabase (check:rls).
import { PGlite } from '@electric-sql/pglite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { findTablesWithoutRls } from '../../scripts/rls-guard'
import { SUPABASE_STUB_SQL } from '../helpers/supabase-stub'

const DIR = 'supabase/migrations'
const migrations = readdirSync(DIR)
  .filter((file) => file.endsWith('.sql'))
  .sort()

let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.exec(SUPABASE_STUB_SQL)
  for (const file of migrations) await db.exec(readFileSync(join(DIR, file), 'utf8'))
})

afterAll(async () => {
  await db.close()
})

describe('migrations', () => {
  it('leave no table in schema public without row-level security', async () => {
    const offenders = await findTablesWithoutRls(
      async (sql) => (await db.query<{ table_name: string }>(sql)).rows,
    )
    expect(offenders).toEqual([])
  })

  it('create the data foundation tables', async () => {
    const { rows } = await db.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public'",
    )
    expect(rows.map((row) => row.table_name)).toEqual(
      expect.arrayContaining(['users', 'applications', 'config', 'audit_log', 'members']),
    )
  })
})
