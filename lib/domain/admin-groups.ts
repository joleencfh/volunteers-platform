// Admin management of working groups (W-06, spec section 5). Pure: no I/O.
import { z } from 'zod'
import {
  GROUP_DESCRIPTION_MAX_LENGTH,
  GROUP_NAME_MAX_LENGTH,
  GROUP_SLUG_MAX_LENGTH,
  isValidSlug,
} from './groups'
import { isValidLinkUrl } from './meetings'

const name = z.string().trim().min(1).max(GROUP_NAME_MAX_LENGTH)
const description = z.string().trim().min(1).max(GROUP_DESCRIPTION_MAX_LENGTH)

/** A blank field clears the link; anything else must be an https link. */
const optionalLink = z
  .string()
  .trim()
  .refine((value) => value === '' || isValidLinkUrl(value))
  .transform((value) => (value === '' ? null : value))

export const createGroupSchema = z.object({
  name,
  // The slug is chosen once, here, and never changes (stable URLs).
  slug: z.string().trim().max(GROUP_SLUG_MAX_LENGTH).refine(isValidSlug),
  description,
})

export const updateGroupSchema = z.object({
  groupId: z.uuid(),
  name,
  description,
  signalUrl: optionalLink,
  docsUrl: optionalLink,
})

export const groupTargetSchema = z.object({ groupId: z.uuid() })
export const groupMemberSchema = z.object({ groupId: z.uuid(), userId: z.uuid() })

/** The fields of a group an update can change, as the audit entry names them (no values). */
export function changedGroupFields(
  current: {
    name: string
    description: string
    signal_url: string | null
    docs_url: string | null
  },
  next: { name: string; description: string; signalUrl: string | null; docsUrl: string | null },
): string[] {
  const changed: string[] = []
  if (current.name !== next.name) changed.push('name')
  if (current.description !== next.description) changed.push('description')
  if (current.signal_url !== next.signalUrl) changed.push('signal_url')
  if (current.docs_url !== next.docsUrl) changed.push('docs_url')
  return changed
}

/**
 * Called once after an admin creates a group. It does nothing: the database creates the group's
 * General activity with a trigger (T-01, ADR-0019), which also backfilled Lobbying. Kept as the
 * place for any later application-side work on a new group.
 */
export async function onGroupCreated(groupId: string): Promise<void> {
  void groupId
}
