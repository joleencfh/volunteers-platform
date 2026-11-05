import 'server-only'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { findMember, type Member } from './member'

export type { Member } from './member'

// These read the session, so a component calling them sits behind <Suspense> (Cache Components).
// Server actions call them first: a 'use server' function is a public endpoint.

/** The signed-in active member. Redirects to /login for anyone else. */
export async function requireUser(): Promise<Member> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect('/login')
  const member = await findMember(supabase, data.user)
  if (!member) redirect('/login?error=signin')
  return member
}

/** The signed-in active admin. A member who is not an admin gets a 404, as if the page did not exist. */
export async function requireAdmin(): Promise<Member> {
  const member = await requireUser()
  if (!member.isAdmin) notFound()
  return member
}
