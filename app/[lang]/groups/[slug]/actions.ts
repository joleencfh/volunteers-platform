'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/lib/authz'
import { createClient } from '@/lib/supabase/server'

export type JoinState = {
  status: 'idle' | 'requested' | 'invalid' | 'notAllowed' | 'unavailable'
}

export type DecisionState = {
  status: 'idle' | 'approved' | 'rejected' | 'invalid' | 'notFound' | 'conflict' | 'unavailable'
}

const PG_UNIQUE_VIOLATION = '23505'
const PG_INSUFFICIENT_PRIVILEGE = '42501'
const PG_NO_DATA_FOUND = 'P0002'
const PG_OBJECT_NOT_IN_STATE = '55000'

const groupInput = z.object({ groupId: z.uuid() })
const decisionInput = z.object({ requestId: z.uuid(), approve: z.enum(['true', 'false']) })

/**
 * Asks to join a working group. Inserted through the RLS client: the policy lets an active,
 * non-admin member ask only for themselves, only for an active group they are not in. A second
 * pending request is a quiet no-op (the unique index refuses it), not an error. No email goes out
 * (spec section 9); approvers see a badge.
 */
export async function requestToJoin(_previous: JoinState, formData: FormData): Promise<JoinState> {
  const member = await requireUser()

  const parsed = groupInput.safeParse({ groupId: formData.get('groupId') })
  if (!parsed.success) return { status: 'invalid' }
  // Admins are in every group already; the policy refuses them too.
  if (member.isAdmin) return { status: 'notAllowed' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('wg_join_requests')
    .insert({ group_id: parsed.data.groupId, user_id: member.id })
  if (error?.code === PG_UNIQUE_VIOLATION) return { status: 'requested' }
  if (error?.code === PG_INSUFFICIENT_PRIVILEGE) return { status: 'notAllowed' }
  if (error) return { status: 'unavailable' }

  revalidatePath('/groups/[slug]', 'page')
  return { status: 'requested' }
}

/**
 * Approves or rejects a pending join request through decide_join_request, which checks that the
 * caller may approve for the request's group and adds the membership on approval. No audit entry:
 * a decision by a group approver is not an admin action, and the request row keeps `decided_by`
 * and `decided_at`.
 */
export async function decideJoinRequest(
  _previous: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  await requireUser()

  const parsed = decisionInput.safeParse({
    requestId: formData.get('requestId'),
    approve: formData.get('approve'),
  })
  if (!parsed.success) return { status: 'invalid' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('decide_join_request', {
    p_request: parsed.data.requestId,
    p_approve: parsed.data.approve === 'true',
  })
  if (error?.code === PG_NO_DATA_FOUND || error?.code === PG_INSUFFICIENT_PRIVILEGE) {
    return { status: 'notFound' }
  }
  if (error?.code === PG_OBJECT_NOT_IN_STATE) return { status: 'conflict' }
  if (error || (data !== 'approved' && data !== 'rejected')) return { status: 'unavailable' }

  revalidatePath('/groups/[slug]', 'page')
  return { status: data }
}
