// Fails (exit code 1) if any table in the public schema has row-level security disabled.
// Usage: bun run check:rls   (needs the local database: bun run db:start)
// Override the connection with DATABASE_URL, e.g. to check staging before a release.
import postgres from 'postgres'
import { findTablesWithoutRls } from './rls-guard'

const url = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const sql = postgres(url, { max: 1, onnotice: () => {} })

try {
  const offenders = await findTablesWithoutRls(
    async (text) => (await sql.unsafe(text)) as unknown as { table_name: string }[],
  )
  if (offenders.length > 0) {
    console.error('Tables without row-level security in schema public:')
    for (const name of offenders) console.error(`  - ${name}`)
    console.error('Add "alter table ... enable row level security;" and policies in a migration.')
    process.exitCode = 1
  } else {
    console.log('RLS guard: every table in schema public has row-level security enabled.')
  }
} catch (error) {
  console.error(
    'RLS guard could not reach the database. Is local Supabase running (bun run db:start)?',
  )
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await sql.end({ timeout: 5 })
}
