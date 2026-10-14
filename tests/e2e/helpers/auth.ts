// Signs a fixture user into a Playwright browser context without going through the UI, which is
// password-less (magic link and Google). The session cookies are produced by @supabase/ssr itself,
// so they match what the app expects.
import { createServerClient } from '@supabase/ssr'
import type { BrowserContext } from '@playwright/test'
import type { FixtureUser } from '../../fixtures/users'
import { supabaseEnv } from '../../helpers/supabase'

export async function loginAs(context: BrowserContext, user: FixtureUser, baseURL: string) {
  const env = supabaseEnv()
  const password = process.env.E2E_PASSWORD
  if (!env || !password) throw new Error('loginAs needs Supabase settings and the E2E global setup')

  const jar = new Map<string, string>()
  const client = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach(({ name, value }) => jar.set(name, value)),
    },
  })

  const { error } = await client.auth.signInWithPassword({ email: user.email, password })
  if (error) throw error

  await context.addCookies([...jar].map(([name, value]) => ({ name, value, url: baseURL })))
  return { client }
}
