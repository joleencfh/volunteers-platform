import { NextResponse } from 'next/server'
import { z } from 'zod'
import { findMember } from '@/lib/authz/member'
import { LOCALE_COOKIE, localeCookieOptions } from '@/lib/domain/locale-preference'
import { safeNextPath } from '@/lib/domain/routes'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const query = z.object({ code: z.string().min(1).max(512), next: z.string().max(2048).optional() })

// Landing point of the magic link and of Google. Every failure, including a verified identity
// that is not an active member, ends the same way: signed out, back on /login with one generic
// message, so the response never tells a visitor whether an email belongs to a member.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const refused = () => NextResponse.redirect(new URL('/login?error=signin', origin))

  const parsed = query.safeParse({
    code: searchParams.get('code') ?? undefined,
    next: searchParams.get('next') ?? undefined,
  })
  if (!parsed.success) return refused()

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(parsed.data.code)
  if (error || !data.user) return refused()

  const member = await findMember(supabase, data.user)
  if (!member) {
    await supabase.auth.signOut()
    return refused()
  }

  // Members cannot write their own row; the service role records the sign-in time.
  await createAdminClient()
    .from('users')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', member.id)

  // Mirror the stored language into the cookie the proxy reads (ADR-0016).
  const response = NextResponse.redirect(new URL(safeNextPath(parsed.data.next), origin))
  response.cookies.set(
    LOCALE_COOKIE,
    member.locale,
    localeCookieOptions(process.env.NODE_ENV === 'production'),
  )
  return response
}
