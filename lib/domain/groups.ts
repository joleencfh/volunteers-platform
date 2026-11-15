// Working group permissions and field limits (spec sections 3 and 5). Pure: no I/O.
// The same rules live in SQL (supabase/migrations/20261115150206_working_groups.sql);
// tests/db/working-groups-rls.test.ts fails if the two drift.
import type { UserLevel } from './review'

/** Who is asking, as far as one working group is concerned. */
export type GroupActor = {
  level: UserLevel
  isAdmin: boolean
  /** An active member of this group, and the group is not archived. */
  isMember: boolean
}

export const GROUP_SLUG_MAX_LENGTH = 60
export const GROUP_NAME_MAX_LENGTH = 80
export const GROUP_DESCRIPTION_MAX_LENGTH = 500

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

const isFreshOrAbove = (level: UserLevel) => level === 'fresh' || level === 'experienced'

/** Join requests: fresh or experienced members of the group, or an admin. */
export function canApproveJoin({ level, isAdmin, isMember }: GroupActor): boolean {
  return isAdmin || (isMember && isFreshOrAbove(level))
}

/** Lead of the week: experienced members of the group, or an admin. */
export function canAssignLead({ level, isAdmin, isMember }: GroupActor): boolean {
  return isAdmin || (isMember && level === 'experienced')
}

/** Meetings and the Signal and docs links: fresh or experienced members of the group, or an admin. */
export function canEditGroupContent({ level, isAdmin, isMember }: GroupActor): boolean {
  return isAdmin || (isMember && isFreshOrAbove(level))
}

/** Lowercase letters, digits and single hyphens between them; fixed once the group exists. */
export function isValidSlug(slug: string): boolean {
  return slug.length <= GROUP_SLUG_MAX_LENGTH && SLUG_PATTERN.test(slug)
}

/** A row of list_working_groups(); get_working_group() adds the two links. Columns may be null. */
export type GroupRow = {
  id: string
  slug: string
  name: string
  description: string
  is_member: boolean | null
  archived: boolean | null
  lead_user_id: string | null
  lead_display_name: string | null
  signal_url?: string | null
  docs_url?: string | null
}

/** What a group page or card shows. Links are null for non-members (the database leaves them out). */
export type GroupView = {
  id: string
  slug: string
  name: string
  description: string
  isMember: boolean
  archived: boolean
  lead: { userId: string; displayName: string } | null
  signalUrl: string | null
  docsUrl: string | null
}

export function toGroupView(row: GroupRow): GroupView {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    isMember: row.is_member === true,
    archived: row.archived === true,
    lead:
      row.lead_user_id && row.lead_display_name
        ? { userId: row.lead_user_id, displayName: row.lead_display_name }
        : null,
    signalUrl: row.signal_url ?? null,
    docsUrl: row.docs_url ?? null,
  }
}
