'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireUser } from '@/lib/authz'
import { parseDataRequestKind } from '@/lib/domain/data-requests'
import { LOCALES } from '@/lib/domain/locale'
import { LOCALE_COOKIE, localeCookieOptions } from '@/lib/domain/locale-preference'
import { sendDataRequestEmail } from '@/lib/email/notify'
import { createRateLimiter } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'

export type LocaleState = { status: 'idle' | 'saved' | 'invalid' | 'unavailable' }

const input = z.object({ locale: z.enum(LOCALES) })

/**
 * Saves the member's language: users.locale through the narrow set_own_locale function (the
 * source of truth), then the cookie the proxy reads (ADR-0016). The page does a full reload on
 * "saved" so the next request carries the new cookie.
 */
export async function setLocale(_previous: LocaleState, formData: FormData): Promise<LocaleState> {
  await requireUser()

  const parsed = input.safeParse({ locale: formData.get('locale') })
  if (!parsed.success) return { status: 'invalid' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('set_own_locale', { new_locale: parsed.data.locale })
  if (error) return { status: 'unavailable' }

  const store = await cookies()
  store.set(
    LOCALE_COOKIE,
    parsed.data.locale,
    localeCookieOptions(process.env.NODE_ENV === 'production'),
  )
  return { status: 'saved' }
}

/** Ends the session on this device, forgets the language cookie and goes to the login page. */
export async function signOut(): Promise<void> {
  await requireUser()
  const supabase = await createClient()
  await supabase.auth.signOut()
  const store = await cookies()
  store.delete(LOCALE_COOKIE)
  redirect('/login')
}

export type DataRequestState = {
  status: 'idle' | 'recorded' | 'invalid' | 'limited' | 'unavailable'
}

const PG_UNIQUE_VIOLATION = '23505'

// Per instance, in memory (see lib/rate-limit.ts): a brake on floods, not a security boundary.
const requestLimiter = createRateLimiter({ limit: 5, windowMs: 60 * 60 * 1000 })

/**
 * Files a request to export or delete the member's data (spec section 9). The row is written
 * through the RLS client, so the database enforces "only for yourself, only open". A second open
 * request of the same kind hits the unique index and is a quiet no-op: the member is told the
 * request is recorded and the admins are not mailed again. The request is saved even if the
 * admin email cannot be sent, and the member is told only that it was recorded.
 */
export async function requestData(
  _previous: DataRequestState,
  formData: FormData,
): Promise<DataRequestState> {
  const member = await requireUser()

  const kind = parseDataRequestKind(formData.get('kind'))
  if (!kind) return { status: 'invalid' }
  if (!requestLimiter.check(member.id).allowed) return { status: 'limited' }

  const supabase = await createClient()
  const { error } = await supabase.from('data_requests').insert({ user_id: member.id, kind })
  if (error?.code === PG_UNIQUE_VIOLATION) {
    revalidatePath('/[lang]/settings', 'page')
    return { status: 'recorded' }
  }
  if (error) return { status: 'unavailable' }

  await sendDataRequestEmail(kind, member.displayName)
  revalidatePath('/[lang]/settings', 'page')
  return { status: 'recorded' }
}
