// The postmortem of an activity (spec section 5): what went well, points for improvement and
// general learning points. Pure: no I/O. The same rule lives in SQL (save_postmortem in
// supabase/migrations/20261118090512_activity_postmortem.sql); tests/db/postmortem.test.ts fails if
// the two drift.
import { z } from 'zod'
import { POSTMORTEM_FIELD_MAX_LENGTH, type ActivityStatus } from './activities'
import type { GroupActor } from './groups'

/** Who is asking: their place in the group, and whether they take part in the activity. */
export type PostmortemActor = GroupActor & { isParticipant: boolean }

/**
 * Participants (participant or observer) and experienced members of the group, and admins. Other
 * members of the group only read it.
 */
export function canEditPostmortem(actor: PostmortemActor): boolean {
  if (actor.isAdmin) return true
  return actor.isMember && (actor.isParticipant || actor.level === 'experienced')
}

const optionalText = z
  .string()
  .trim()
  .max(POSTMORTEM_FIELD_MAX_LENGTH)
  .transform((value) => (value === '' ? null : value))

/** The three optional texts; blank becomes null. */
export const postmortemSchema = z.object({
  wentWell: optionalText,
  improvements: optionalText,
  learnings: optionalText,
})

export type PostmortemInput = z.infer<typeof postmortemSchema>

export type PostmortemFields = {
  went_well: string | null
  improvements: string | null
  learnings: string | null
}

const isEmpty = (value: string | null) => (value ?? '').trim() === ''

/** True when the activity has any postmortem text. */
export function hasPostmortem(fields: PostmortemFields): boolean {
  return !(isEmpty(fields.went_well) && isEmpty(fields.improvements) && isEmpty(fields.learnings))
}

/** A done activity whose three fields are all empty gets a gentle prompt. */
export function needsPostmortemPrompt(
  activity: { status: ActivityStatus | string } & PostmortemFields,
): boolean {
  return activity.status === 'done' && !hasPostmortem(activity)
}
