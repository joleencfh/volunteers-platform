// Runs the database tests (tests/db) against local Supabase.
// In CI the database must be reachable, otherwise this fails. On a machine without a local
// database (the maintainer has no Docker) it prints a message and succeeds, since CI runs these
// tests on every pull request.
import { spawnSync } from 'node:child_process'
import postgres from 'postgres'
import { assertLocalTarget } from '../tests/helpers/local-only'

const url = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

try {
  assertLocalTarget('DATABASE_URL', url)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

async function databaseReachable(): Promise<boolean> {
  const sql = postgres(url, { max: 1, connect_timeout: 3, onnotice: () => {} })
  try {
    await sql`select 1`
    return true
  } catch {
    return false
  } finally {
    await sql.end({ timeout: 1 })
  }
}

if (!(await databaseReachable())) {
  if (process.env.CI) {
    console.error('Database tests: no database reachable in CI. Is local Supabase running?')
    process.exit(1)
  }
  console.log('Database tests skipped: no local database reachable (CI runs them).')
  console.log('To run them here, start local Supabase with Docker (see docs/runbook.md).')
  process.exit(0)
}

// process.execPath is bun when this script runs under bun
const result = spawnSync(process.execPath, ['x', 'vitest', 'run', '-c', 'vitest.db.config.mts'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: url },
})
process.exit(result.status ?? 1)
