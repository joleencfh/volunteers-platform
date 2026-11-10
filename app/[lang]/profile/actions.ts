'use server'

import { requireUser } from '@/lib/authz'
import {
  parseProfileForm,
  visibilityChanges,
  type ProfileFieldError,
  type ProfileFormField,
} from '@/lib/domain/profile-fields'
import { createClient } from '@/lib/supabase/server'

export type ProfileState = {
  status: 'idle' | 'saved' | 'invalid' | 'unavailable'
  errors?: Partial<Record<ProfileFormField, ProfileFieldError>>
}

/**
 * Saves the signed-in member's own profile: the narrow update_own_profile function for the
 * fields, then their visibility choices. Both run with the member's own session (row-level
 * security), never the service role. Nothing here logs what was entered.
 */
export async function saveProfile(
  _previous: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const member = await requireUser()

  const parsed = parseProfileForm(Object.fromEntries(formData))
  if (!parsed.ok) return { status: 'invalid', errors: parsed.errors }
  const input = parsed.data

  const supabase = await createClient()
  const { error } = await supabase.rpc('update_own_profile', {
    display_name: input.displayName,
    city: input.city ?? '',
    bio: input.bio ?? '',
    linkedin_url: input.linkedinUrl ?? '',
    ai_safety_knowledge: input.aiSafetyKnowledge ?? '',
    ai_risks: input.aiRisks ?? '',
  })
  if (error) return { status: 'unavailable' }

  const { store, clear } = visibilityChanges(input.visibility)
  if (store.length > 0) {
    const { error: upsertError } = await supabase
      .from('profile_visibility')
      .upsert(store.map(({ field, tier }) => ({ user_id: member.id, field, tier })))
    if (upsertError) return { status: 'unavailable' }
  }
  if (clear.length > 0) {
    const { error: clearError } = await supabase
      .from('profile_visibility')
      .delete()
      .eq('user_id', member.id)
      .in('field', clear)
    if (clearError) return { status: 'unavailable' }
  }
  return { status: 'saved' }
}
