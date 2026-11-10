'use server'

import { z } from 'zod'
import { requireAdmin } from '@/lib/authz'
import { recordAudit } from '@/lib/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export type AdminStepState = {
  status: 'done' | 'invalid' | 'notFound' | 'refused' | 'unavailable'
  /** False when nothing changed (the step was already in the requested state). */
  changed?: boolean
}

const PG_UNIQUE_VIOLATION = '23505'

const input = z.object({
  userId: z.uuid(),
  step: z.string().trim().min(1).max(64),
})

type Lookup =
  | { ok: true; stepId: string; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; state: AdminStepState }

/** Validates the input and finds the admin-confirmed step and the active member. */
async function lookup(userId: unknown, step: unknown): Promise<Lookup> {
  const parsed = input.safeParse({ userId, step })
  if (!parsed.success) return { ok: false, state: { status: 'invalid' } }

  // The RLS client: only an admin's policies let these reads through.
  const supabase = await createClient()
  const [stepResult, memberResult] = await Promise.all([
    supabase
      .from('onboarding_steps')
      .select('id, confirmed_by, active')
      .eq('key', parsed.data.step)
      .maybeSingle(),
    supabase
      .from('users')
      .select('id')
      .eq('id', parsed.data.userId)
      .eq('status', 'active')
      .maybeSingle(),
  ])
  if (stepResult.error || memberResult.error) return { ok: false, state: { status: 'unavailable' } }
  if (!stepResult.data || !stepResult.data.active || !memberResult.data) {
    return { ok: false, state: { status: 'notFound' } }
  }
  if (stepResult.data.confirmed_by !== 'admin') return { ok: false, state: { status: 'refused' } }
  return { ok: true, stepId: stepResult.data.id, supabase }
}

/**
 * An admin confirms an admin-confirmed step for a member. Idempotent: confirming twice changes
 * and audits nothing the second time. The audit details hold the step key only, no personal data.
 */
export async function confirmAdminStep(userId: string, step: string): Promise<AdminStepState> {
  const admin = await requireAdmin()
  const found = await lookup(userId, step)
  if (!found.ok) return found.state

  const { error } = await found.supabase
    .from('user_onboarding')
    .insert({ user_id: userId, step_id: found.stepId, completed_by: admin.id })
  if (error?.code === PG_UNIQUE_VIOLATION) return { status: 'done', changed: false }
  if (error) return { status: 'unavailable' }

  await recordAudit(createAdminClient(), {
    actorId: admin.id,
    action: 'onboarding.step_confirmed',
    entityType: 'user_onboarding',
    entityId: userId,
    details: { step },
  })
  return { status: 'done', changed: true }
}

/** An admin takes a confirmation back. Idempotent like confirming: a no-op writes no audit entry. */
export async function unconfirmAdminStep(userId: string, step: string): Promise<AdminStepState> {
  const admin = await requireAdmin()
  const found = await lookup(userId, step)
  if (!found.ok) return found.state

  const { data, error } = await found.supabase
    .from('user_onboarding')
    .delete()
    .eq('user_id', userId)
    .eq('step_id', found.stepId)
    .select('user_id')
  if (error) return { status: 'unavailable' }
  if (data.length === 0) return { status: 'done', changed: false }

  await recordAudit(createAdminClient(), {
    actorId: admin.id,
    action: 'onboarding.step_unconfirmed',
    entityType: 'user_onboarding',
    entityId: userId,
    details: { step },
  })
  return { status: 'done', changed: true }
}
