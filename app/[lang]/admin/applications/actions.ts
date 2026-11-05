'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/authz'
import type { Database } from '@/lib/database.types'
import { normalizeEmail } from '@/lib/domain/membership'
import {
  parseApproval,
  parseRejection,
  type ReviewError,
  type ReviewField,
} from '@/lib/domain/review'
import { recordAudit } from '@/lib/audit'
import { sendApprovalEmail, sendRejectionEmail } from '@/lib/email/notify'
import { createAdminClient } from '@/lib/supabase/admin'

export type ReviewState = {
  status: 'idle' | 'done' | 'invalid' | 'notFound' | 'conflict' | 'unavailable'
  errors?: Partial<Record<ReviewField, ReviewError>>
  /** False when the decision was saved but the email could not be sent. */
  emailSent?: boolean
}

const PG_UNIQUE_VIOLATION = '23505'
const AUTH_EMAIL_EXISTS = 'email_exists'
const LIST_PAGE_SIZE = 200
const LIST_MAX_PAGES = 25

type Db = SupabaseClient<Database>

// The decisions use the service role because they create an Auth user and write the audit log,
// which no member may do; requireAdmin has already run by then. Nothing here logs names, emails
// or cities, and the audit details hold ids and the admin's stated reason only.

async function findApplication(db: Db, id: string) {
  const { data, error } = await db
    .from('applications')
    .select('id, status, email, display_name, real_name, city')
    .eq('id', id)
    .maybeSingle()
  return { application: data, failed: Boolean(error) }
}

/** The Auth user for an email, created if it does not exist yet. Null on failure. */
async function ensureAuthUser(db: Db, email: string): Promise<string | null> {
  const created = await db.auth.admin.createUser({ email, email_confirm: true })
  if (created.data.user) return created.data.user.id
  if (created.error?.code !== AUTH_EMAIL_EXISTS) return null

  // The address already has an Auth user (an earlier, half-finished approval): reuse it.
  // The admin API has no lookup by email, so page through the list.
  for (let page = 1; page <= LIST_MAX_PAGES; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: LIST_PAGE_SIZE })
    if (error) return null
    const match = data.users.find((user) => normalizeEmail(user.email ?? '') === email)
    if (match) return match.id
    if (data.users.length < LIST_PAGE_SIZE) return null
  }
  return null
}

/** The Auth user id once the member row exists for an approved applicant, or null on failure. */
async function ensureMember(
  db: Db,
  email: string,
  application: { display_name: string; real_name: string; city: string },
  level: Database['public']['Enums']['user_level'],
): Promise<string | null> {
  const userId = await ensureAuthUser(db, email)
  if (!userId) return null
  const { error } = await db.from('users').insert({
    id: userId,
    display_name: application.display_name,
    real_name: application.real_name,
    email,
    city: application.city,
    level,
  })
  // The row exists already (an earlier, half-finished approval): carry on.
  if (error && error.code !== PG_UNIQUE_VIOLATION) return null
  return userId
}

/**
 * Approves a pending application: marks it approved, creates the Auth user and the member row,
 * writes the audit entry and emails the applicant how to sign in.
 *
 * The application is claimed first, so only one request can decide it: if another admin rejected
 * it in the meantime, nothing is created. If the member cannot be created after the claim, the
 * claim is undone. Idempotent: approving an approved application sends and audits nothing, and
 * creates the member only if an earlier attempt left it missing.
 */
export async function approveApplication(
  _previous: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const admin = await requireAdmin()

  const parsed = parseApproval(Object.fromEntries(formData))
  if (!parsed.ok) return { status: 'invalid', errors: parsed.errors }
  const { applicationId, level, reason } = parsed.data

  const db = createAdminClient()
  const { application, failed } = await findApplication(db, applicationId)
  if (failed) return { status: 'unavailable' }
  if (!application) return { status: 'notFound' }
  if (application.status === 'rejected') return { status: 'conflict' }

  const email = normalizeEmail(application.email)
  let claimedHere = false
  if (application.status === 'pending') {
    // Only the request that flips pending to approved audits and emails, so a double click or a
    // second admin cannot produce a second entry or a second email.
    const { data: claimed, error: claimError } = await db
      .from('applications')
      .update({ status: 'approved', decided_by: admin.id, decided_at: new Date().toISOString() })
      .eq('id', applicationId)
      .eq('status', 'pending')
      .select('id')
    if (claimError) return { status: 'unavailable' }
    claimedHere = claimed.length > 0
    if (!claimedHere) {
      // Someone decided it between our read and our claim: go along with an approval only.
      const latest = await findApplication(db, applicationId)
      if (latest.failed) return { status: 'unavailable' }
      if (latest.application?.status !== 'approved') return { status: 'conflict' }
    }
  }

  const userId = await ensureMember(db, email, application, level)
  if (!userId) {
    // Undo our claim so the application can be approved again. Best effort: if this fails too,
    // approving it again creates the missing member.
    if (claimedHere) {
      await db
        .from('applications')
        .update({ status: 'pending', decided_by: null, decided_at: null })
        .eq('id', applicationId)
        .eq('status', 'approved')
        .select('id')
    }
    return { status: 'unavailable' }
  }
  if (!claimedHere) return { status: 'done' }

  await recordAudit(db, {
    actorId: admin.id,
    action: 'application.approved',
    entityType: 'application',
    entityId: applicationId,
    details: { userId, level, reason },
  })
  const emailSent = await sendApprovalEmail(email)

  revalidatePath('/[lang]/admin/applications', 'page')
  return { status: 'done', emailSent }
}

/**
 * Rejects a pending application: marks it rejected, writes the audit entry and emails a short
 * notice. No member is created. Idempotent like approval.
 */
export async function rejectApplication(
  _previous: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const admin = await requireAdmin()

  const parsed = parseRejection(Object.fromEntries(formData))
  if (!parsed.ok) return { status: 'invalid', errors: parsed.errors }
  const { applicationId } = parsed.data

  const db = createAdminClient()
  const { application, failed } = await findApplication(db, applicationId)
  if (failed) return { status: 'unavailable' }
  if (!application) return { status: 'notFound' }
  if (application.status === 'rejected') return { status: 'done' }
  if (application.status === 'approved') return { status: 'conflict' }

  const { data: claimed, error: claimError } = await db
    .from('applications')
    .update({ status: 'rejected', decided_by: admin.id, decided_at: new Date().toISOString() })
    .eq('id', applicationId)
    .eq('status', 'pending')
    .select('id')
  if (claimError) return { status: 'unavailable' }
  if (claimed.length === 0) return { status: 'done' }

  await recordAudit(db, {
    actorId: admin.id,
    action: 'application.rejected',
    entityType: 'application',
    entityId: applicationId,
  })
  const emailSent = await sendRejectionEmail(normalizeEmail(application.email))

  revalidatePath('/[lang]/admin/applications', 'page')
  return { status: 'done', emailSent }
}
