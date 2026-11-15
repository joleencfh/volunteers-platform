'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/authz'
import { recordAudit } from '@/lib/audit'
import { parseRequestId } from '@/lib/domain/data-requests'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export type HandleState = {
  status: 'idle' | 'done' | 'invalid' | 'notFound' | 'unavailable'
  /** False when the request was already handled: nothing changed and nothing was audited. */
  changed?: boolean
}

/**
 * An admin marks a data request as handled. Idempotent: a request that is already done changes
 * and audits nothing. The audit details hold the kind only: no names, no emails.
 */
export async function markRequestHandled(
  _previous: HandleState,
  formData: FormData,
): Promise<HandleState> {
  const admin = await requireAdmin()

  const id = parseRequestId(formData.get('requestId'))
  if (!id) return { status: 'invalid' }

  // The RLS client: only an admin's policies allow this update.
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('data_requests')
    .update({ status: 'done', handled_at: new Date().toISOString(), handled_by: admin.id })
    .eq('id', id)
    .eq('status', 'open')
    .select('id, kind, user_id')
  if (error) return { status: 'unavailable' }

  const changed = data[0]
  if (!changed) {
    const { data: existing, error: lookupError } = await supabase
      .from('data_requests')
      .select('id')
      .eq('id', id)
      .maybeSingle()
    if (lookupError) return { status: 'unavailable' }
    return existing ? { status: 'done', changed: false } : { status: 'notFound' }
  }

  await recordAudit(createAdminClient(), {
    actorId: admin.id,
    action: 'data_request.handled',
    entityType: 'data_request',
    entityId: changed.id,
    details: { kind: changed.kind, userId: changed.user_id },
  })
  revalidatePath('/[lang]/admin/data-requests', 'page')
  return { status: 'done', changed: true }
}
