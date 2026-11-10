// Profile fields and who may see them (spec section 7). Pure: no I/O.
// The migration supabase/migrations/20261110120000_profile_visibility.sql repeats the field list,
// tiers and defaults; tests/db/profile-visibility.test.ts fails if the two drift (ADR-0014).
import { z } from 'zod'
import { KNOWLEDGE_LEVELS } from './application'

/** Optional fields, each with a visibility tier the volunteer chooses. Database column names. */
export const PROFILE_FIELDS = [
  'city',
  'bio',
  'linkedin_url',
  'ai_safety_knowledge',
  'ai_risks',
] as const
export type ProfileField = (typeof PROFILE_FIELDS)[number]

/** Admin only; people who share a working group with the viewer; all members. */
export const VISIBILITY_TIERS = ['admin', 'group', 'members'] as const
export type VisibilityTier = (typeof VISIBILITY_TIERS)[number]

/** The tier a field has while the volunteer has not chosen one. */
export const DEFAULT_TIERS: Readonly<Record<ProfileField, VisibilityTier>> = {
  city: 'admin',
  bio: 'members',
  linkedin_url: 'admin',
  ai_safety_knowledge: 'group',
  ai_risks: 'group',
}

/**
 * Fields only an admin (and the person themselves) ever sees, whatever the tiers say. How someone
 * heard of PauseAI is also fixed admin-only; it stays on applications and no profile query returns it.
 */
export const FIXED_FIELDS = [
  'real_name',
  'email',
  'joined_at',
  'first_active_at',
  'last_login_at',
] as const
export type FixedField = (typeof FIXED_FIELDS)[number]

export const PROFILE_LIMITS = {
  displayName: 60,
  city: 100,
  bio: 500,
  linkedinUrl: 300,
  aiRisks: 500,
} as const

export function effectiveTier(
  chosen: VisibilityTier | null | undefined,
  field: ProfileField,
): VisibilityTier {
  return chosen ?? DEFAULT_TIERS[field]
}

/** Why a field was refused; the profile form maps each code to a message. */
export type ProfileFieldError = 'required' | 'tooLong' | 'invalidUrl' | 'invalidChoice'

const text = (max: number) => z.string().trim().max(max, 'tooLong')
/** Blank optional text is stored as null. */
const optional = (max: number) => text(max).transform((value) => value || null)

const tier = z.enum(VISIBILITY_TIERS, 'invalidChoice')

/** What the profile form sends, once validated. Mirrors update_own_profile and profile_visibility. */
export const profileInputSchema = z.object({
  displayName: text(PROFILE_LIMITS.displayName).min(1, 'required'),
  city: optional(PROFILE_LIMITS.city),
  bio: optional(PROFILE_LIMITS.bio),
  linkedinUrl: text(PROFILE_LIMITS.linkedinUrl)
    .refine((value) => value === '' || isHttpsUrl(value), 'invalidUrl')
    .transform((value) => value || null),
  aiSafetyKnowledge: z
    .union([z.literal(''), z.enum(KNOWLEDGE_LEVELS)], 'invalidChoice')
    .transform((value) => value || null),
  aiRisks: optional(PROFILE_LIMITS.aiRisks),
  visibility: z.object({
    city: tier,
    bio: tier,
    linkedin_url: tier,
    ai_safety_knowledge: tier,
    ai_risks: tier,
  }),
})
export type ProfileInput = z.output<typeof profileInputSchema>

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:' && value.startsWith('https://')
  } catch {
    return false
  }
}
