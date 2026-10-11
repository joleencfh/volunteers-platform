// Prints the local Supabase connection settings as KEY=value lines, using the variable names the
// app and the tests read. CI appends the output to $GITHUB_ENV; locally:
//   bun scripts/supabase-env.ts >> .env.local   (only if you run local Supabase)
// Reads `supabase status`, so local Supabase must be running.
import { execFileSync } from 'node:child_process'

const raw = execFileSync(process.execPath, ['x', 'supabase', 'status', '-o', 'json'], {
  encoding: 'utf8',
})
const status = JSON.parse(raw.slice(raw.indexOf('{'))) as Record<string, string>

const pick = (...keys: string[]) => {
  for (const key of keys) if (status[key]) return status[key]
  throw new Error(`supabase status has none of: ${keys.join(', ')}`)
}

const lines = {
  NEXT_PUBLIC_SUPABASE_URL: pick('API_URL'),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: pick('ANON_KEY', 'PUBLISHABLE_KEY'),
  SUPABASE_SERVICE_ROLE_KEY: pick('SERVICE_ROLE_KEY', 'SECRET_KEY'),
  DATABASE_URL: pick('DB_URL'),
}

for (const [key, value] of Object.entries(lines)) console.log(`${key}=${value}`)
