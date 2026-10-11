// Finds tables in the public schema that do not have row-level security enabled.
// Pure and driver-agnostic so it can run against local Supabase (postgres.js) and, in the
// self-test, against an in-memory Postgres (PGlite).

export type Query = (sql: string) => Promise<ReadonlyArray<{ table_name: string }>>

const SQL = `
  select c.relname as table_name
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and not c.relrowsecurity
  order by c.relname
`

export async function findTablesWithoutRls(query: Query): Promise<string[]> {
  const rows = await query(SQL)
  return rows.map((row) => row.table_name)
}
