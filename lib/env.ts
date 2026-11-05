import { PHASE_PRODUCTION_BUILD } from 'next/constants'
import { z } from 'zod'

// Environment variables the app needs. `.env.schema` documents the same list; keep the two in
// step. Validated at build and at server start (next.config.ts), so a deployment with a missing
// or malformed value fails immediately instead of at the first request.
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  // Publishable (public) key, shipped to the browser.
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  // Bypasses row-level security. Server-only.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // Public address of the site, the only origin sign-in links may point back to. Local origins
  // are allowed outside production without it; set it on every deployment.
  NEXT_PUBLIC_SITE_URL: z.url().optional(),
  // Application emails (A-04). Optional: without both, decisions save but no email is sent.
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).optional(),
})

export type Env = z.infer<typeof schema>

// Treat empty strings (`NAME=` in .env files) as unset.
function clean(source: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''))
}

/** Throws with the names (never the values) of every missing or invalid variable. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(clean(source))
  if (result.success) return result.data
  const problems = result.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
  throw new Error(`Invalid environment variables:\n${problems.join('\n')}\nSee .env.schema.`)
}

/**
 * Called from next.config.ts at build and start. `SKIP_ENV_VALIDATION=1` is for builds that have
 * no secrets, such as the CI static-checks job. It is honoured only in the production build
 * phase: a running server (`next start`) always validates, so a stray flag in a deployment
 * cannot let the app start without its configuration.
 */
export function validateEnv(
  phase: string,
  source: Record<string, string | undefined> = process.env,
): void {
  if (phase === PHASE_PRODUCTION_BUILD && source.SKIP_ENV_VALIDATION === '1') return
  parseEnv(source)
}
