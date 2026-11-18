import 'server-only'
import { isLocale } from '@/lib/domain/locale'
import { allowedOrigins } from '@/lib/domain/routes'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  applicationApprovedEmail,
  applicationRejectedEmail,
  dataRequestEmail,
  newApplicationEmail,
  taskAssignedEmail,
} from './templates'
import { EmailNotConfiguredError, sendEmail } from './transport'

// Every function here swallows nothing the caller needs: they return whether the email went out,
// and log only a fixed label, never an address, a name or the provider's message.

/** The site's own origin for links in emails, or null if none is configured (production). */
function siteOrigin(): string | null {
  return (
    allowedOrigins(process.env.NEXT_PUBLIC_SITE_URL, process.env.NODE_ENV === 'production')[0] ??
    null
  )
}

async function deliver(
  to: string,
  build: (origin: string) => { subject: string; text: string },
): Promise<boolean> {
  const origin = siteOrigin()
  if (!origin) {
    console.error('Email not sent: NEXT_PUBLIC_SITE_URL is not set')
    return false
  }
  try {
    await sendEmail({ to, ...build(origin) })
    return true
  } catch (error) {
    // The not-configured error names settings only, so it is safe to log; anything else is not.
    console.error(
      error instanceof EmailNotConfiguredError
        ? 'Email not sent: RESEND_API_KEY or EMAIL_FROM is not set'
        : 'Email delivery failed',
    )
    return false
  }
}

/** Tells the applicant (in Italian) that they were approved and how to sign in. */
export function sendApprovalEmail(to: string): Promise<boolean> {
  return deliver(to, (origin) => applicationApprovedEmail(`${origin}/login`))
}

/** Tells the applicant (in Italian) that the application was not accepted. */
export function sendRejectionEmail(to: string): Promise<boolean> {
  return deliver(to, (origin) => applicationRejectedEmail(`${origin}/apply`))
}

/** Sends one separate email to every active admin. Never throws. */
async function notifyAdmins(
  build: (origin: string) => { subject: string; text: string },
): Promise<void> {
  try {
    // Service role: the visitor who just applied has no session, and this reads admin addresses
    // only to send mail, never to render them.
    const { data, error } = await createAdminClient()
      .from('users')
      .select('email')
      .eq('is_admin', true)
      .eq('status', 'active')
    if (error || !data) return
    await Promise.all(data.map((admin) => deliver(admin.email, build)))
  } catch {
    console.error('Admin notification failed')
  }
}

/** Tells every active admin (in English) that an application is waiting. Never throws. */
export function notifyAdminsOfApplication(): Promise<void> {
  return notifyAdmins((origin) => newApplicationEmail(`${origin}/admin/applications`))
}

/**
 * Tells every active admin (in English) that a member filed a data request. The email carries
 * the kind and the display name, never an address or real name. Never throws; the request is
 * already saved when this runs, so a failed email loses nothing.
 */
export function sendDataRequestEmail(
  kind: 'export' | 'deletion',
  displayName: string,
): Promise<void> {
  return notifyAdmins((origin) =>
    dataRequestEmail(kind, displayName, `${origin}/admin/data-requests`),
  )
}

export type TaskAssignedInput = {
  assigneeId: string
  groupId: string
  slug: string
  activityId: string
  title: string
  dueOn: string | null
  /** Display name of the person who assigned the task. */
  assignerName: string
}

/**
 * Tells the new assignee (in their saved language) that a task was assigned to them. The address
 * is read here with the service role, as it is admin-only data: it is used to send and never
 * returned or logged. Returns whether the email went out; never throws, so a failure cannot undo
 * the assignment that has already been saved.
 */
export async function sendTaskAssignedEmail(input: TaskAssignedInput): Promise<boolean> {
  try {
    const db = createAdminClient()
    const [assignee, group] = await Promise.all([
      db
        .from('users')
        .select('email, locale')
        .eq('id', input.assigneeId)
        .eq('status', 'active')
        .maybeSingle(),
      db.from('working_groups').select('name').eq('id', input.groupId).maybeSingle(),
    ])
    if (assignee.error || !assignee.data || group.error || !group.data) return false
    const locale = isLocale(assignee.data.locale) ? assignee.data.locale : 'en'
    const groupName = group.data.name
    return await deliver(assignee.data.email, (origin) =>
      taskAssignedEmail(locale, {
        title: input.title,
        groupName,
        dueOn: input.dueOn,
        assignerName: input.assignerName,
        activityUrl: `${origin}/groups/${input.slug}/activities/${input.activityId}`,
      }),
    )
  } catch {
    console.error('Task assignment email failed')
    return false
  }
}
