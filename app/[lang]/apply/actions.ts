'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import {
  APPLICATION_FIELDS,
  parseApplication,
  type ApplicationField,
  type FieldError,
} from '@/lib/domain/application'
import { NOTICE_VERSION } from '@/lib/domain/notice'
import { notifyAdminsOfApplication } from '@/lib/email/notify'
import { createRateLimiter } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'

export type ApplyState = {
  status: 'idle' | 'invalid' | 'limited' | 'unavailable'
  errors?: Partial<Record<ApplicationField, FieldError>>
  /** Echoed back so a refused form keeps what was typed (never logged). */
  values?: Partial<Record<ApplicationField, string>>
}

// Per instance, in memory (see lib/rate-limit.ts): a brake on floods, not a security boundary.
const WINDOW_MS = 60 * 60 * 1000
const perAddress = createRateLimiter({ limit: 10, windowMs: WINDOW_MS })
const perEmail = createRateLimiter({ limit: 3, windowMs: WINDOW_MS })

const HONEYPOT = 'company_website'
const PG_UNIQUE_VIOLATION = '23505'
const PENDING_PATH = '/apply/pending'

/** Escapes `%`, `_` and `\` so an email is matched literally by ilike. */
const likeLiteral = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`)

/**
 * Stores an application. Public by nature (the applicant has no account), so there is no authz
 * helper; the guards are the honeypot, Zod validation, rate limits and the one-open-application
 * rule. The service role is used only for the membership check and the insert.
 *
 * Every accepted outcome ends in the same redirect: a new application, a repeat while one is
 * pending, a bot and an existing member are indistinguishable to the visitor, so the form never
 * reveals who has applied or belongs. Nothing here logs names, emails or cities.
 */
export async function submitApplication(
  _previous: ApplyState,
  formData: FormData,
): Promise<ApplyState> {
  if (formData.get(HONEYPOT)) redirect(PENDING_PATH)

  const raw = Object.fromEntries(formData)
  const parsed = parseApplication(raw)
  if (!parsed.ok) {
    const values: NonNullable<ApplyState['values']> = {}
    for (const field of APPLICATION_FIELDS) {
      const value = raw[field]
      if (typeof value === 'string') values[field] = value
    }
    return { status: 'invalid', errors: parsed.errors, values }
  }
  const { data } = parsed

  const requestHeaders = await headers()
  const address = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!perAddress.check(address).allowed || !perEmail.check(data.email).allowed) {
    return { status: 'limited' }
  }

  const admin = createAdminClient()

  const { data: member, error: memberError } = await admin
    .from('users')
    .select('id')
    .ilike('email', likeLiteral(data.email))
    .maybeSingle()
  if (memberError) return { status: 'unavailable' }
  if (member) redirect(PENDING_PATH)

  const now = new Date().toISOString()
  const { error } = await admin.from('applications').insert({
    display_name: data.displayName,
    real_name: data.realName,
    email: data.email,
    city: data.city,
    motivation: data.motivation,
    heard_via: data.heardVia,
    heard_other: data.heardOther,
    ai_safety_knowledge: data.knowledge,
    privacy_accepted_at: now,
    special_category_consent_at: now,
    notice_version: NOTICE_VERSION,
  })
  // A pending application for this email already exists: same outcome, no second row.
  if (error && error.code !== PG_UNIQUE_VIOLATION) return { status: 'unavailable' }
  // Only a new row tells the admins; a repeat adds nothing to review. Never throws.
  if (!error) await notifyAdminsOfApplication()

  redirect(PENDING_PATH)
}
