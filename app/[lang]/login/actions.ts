'use server'

import { headers } from 'next/headers'
import { z } from 'zod'
import { allowedOrigins, pickRedirectOrigin } from '@/lib/domain/routes'
import { normalizeEmail } from '@/lib/domain/membership'
import { createRateLimiter } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'

export type MagicLinkState = {
  status: 'idle' | 'sent' | 'invalid' | 'limited' | 'unavailable'
}

// Per instance, in memory (see lib/rate-limit.ts): a brake on floods, not a security boundary.
const WINDOW_MS = 15 * 60 * 1000
const perAddress = createRateLimiter({ limit: 10, windowMs: WINDOW_MS })
const perEmail = createRateLimiter({ limit: 3, windowMs: WINDOW_MS })

const input = z.object({ email: z.string().trim().max(254).pipe(z.email()) })

/**
 * Emails a sign-in link. Public by nature (the visitor is not signed in yet), so there is no
 * authz helper; the guards are validation, rate limits and an allowlisted redirect origin.
 * The answer is "sent" whether or not the address belongs to a member: Supabase is told not to
 * create users, so an unknown address simply gets no email.
 */
export async function requestMagicLink(
  _previous: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState> {
  const parsed = input.safeParse({ email: formData.get('email') })
  if (!parsed.success) return { status: 'invalid' }
  const email = normalizeEmail(parsed.data.email)

  const requestHeaders = await headers()
  const address = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const addressCheck = perAddress.check(address)
  const emailCheck = perEmail.check(email)
  if (!addressCheck.allowed || !emailCheck.allowed) return { status: 'limited' }

  const allowed = allowedOrigins(
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NODE_ENV === 'production',
  )
  const origin = pickRedirectOrigin(requestHeaders.get('origin'), allowed)
  if (!origin) return { status: 'unavailable' }

  const supabase = await createClient()
  await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/callback` },
  })
  // The result is deliberately ignored: it must not change the answer.
  return { status: 'sent' }
}
