// The "complete your profile" prompt on the home page (spec section 7). Pure: no I/O.
// It is a prompt, not an onboarding step: display name is required at sign-up, so what can be
// missing is the city and the bio.

export const PROFILE_PROMPT_FIELDS = ['city', 'bio'] as const
export type ProfilePromptField = (typeof PROFILE_PROMPT_FIELDS)[number]

export type ProfileCompletion = {
  /** The prompted fields that are still blank, in display order. */
  missing: ProfilePromptField[]
  complete: boolean
}

function isBlank(value: string | null | undefined): boolean {
  return !value || value.trim().length === 0
}

export function profileCompletion(profile: {
  city?: string | null
  bio?: string | null
}): ProfileCompletion {
  const missing = PROFILE_PROMPT_FIELDS.filter((field) => isBlank(profile[field]))
  return { missing, complete: missing.length === 0 }
}
