// Requests a real magic link from the local Supabase and reads it from the local mail catcher
// (Mailpit, started with Supabase). The PKCE code verifier cookie that the request creates is
// copied into the browser context, so opening the link there completes the sign-in as a visitor's
// browser would.
import { createServerClient } from '@supabase/ssr'
import type { BrowserContext } from '@playwright/test'
import { supabaseEnv } from '../../helpers/supabase'

const MAIL_URL = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324'

async function waitForLink(email: string): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const search = await fetch(
      `${MAIL_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    )
    const found = (await search.json()) as { messages?: { ID: string }[] }
    const id = found.messages?.[0]?.ID
    if (id) {
      const message = (await (await fetch(`${MAIL_URL}/api/v1/message/${id}`)).json()) as {
        Text?: string
        HTML?: string
      }
      const body = `${message.Text ?? ''} ${message.HTML ?? ''}`.replaceAll('&amp;', '&')
      const link = body.match(/https?:\/\/[^\s"'<>]+\/auth\/v1\/verify\?[^\s"'<>]+/)?.[0]
      if (link) return link
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('No magic-link email arrived')
}

export async function requestMagicLink(
  context: BrowserContext,
  email: string,
  baseURL: string,
): Promise<string> {
  const env = supabaseEnv()
  if (!env) throw new Error('requestMagicLink needs Supabase settings')

  const jar = new Map<string, string>()
  const client = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach(({ name, value }) => jar.set(name, value)),
    },
  })
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${baseURL}/auth/callback` },
  })
  if (error) throw error

  await context.addCookies([...jar].map(([name, value]) => ({ name, value, url: baseURL })))
  return waitForLink(email)
}
