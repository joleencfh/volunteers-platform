'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/lib/authz'
import { createClient } from '@/lib/supabase/server'

export type CompleteStepState = {
  status: 'idle' | 'done' | 'invalid' | 'refused' | 'unavailable'
}

const PG_UNIQUE_VIOLATION = '23505'

const input = z.object({ step: z.string().trim().min(1).max(64) })

/**
 * A volunteer confirms one of their own self-confirmed steps. Runs with the member's own
 * session: row-level security (ADR-0015) refuses any other step or any other person, and this
 * action checks the confirmer as well so the answer is a typed state. Completing a step twice
 * is not an error.
 */
export async function completeOnboardingStep(
  _previous: CompleteStepState,
  formData: FormData,
): Promise<CompleteStepState> {
  const member = await requireUser()

  const parsed = input.safeParse({ step: formData.get('step') })
  if (!parsed.success) return { status: 'invalid' }

  const supabase = await createClient()
  const { data: step, error: stepError } = await supabase
    .from('onboarding_steps')
    .select('id, confirmed_by, active')
    .eq('key', parsed.data.step)
    .maybeSingle()
  if (stepError) return { status: 'unavailable' }
  if (!step || !step.active) return { status: 'invalid' }
  if (step.confirmed_by !== 'self') return { status: 'refused' }

  const { error } = await supabase
    .from('user_onboarding')
    .insert({ user_id: member.id, step_id: step.id, completed_by: member.id })
  if (error && error.code !== PG_UNIQUE_VIOLATION) return { status: 'unavailable' }

  revalidatePath('/[lang]/home', 'page')
  return { status: 'done' }
}
