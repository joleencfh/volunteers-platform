// Activity and task permissions, lists and field limits (spec sections 2, 3 and 5). Pure: no I/O.
// The same rules live in SQL (supabase/migrations/20261117151043_activities_and_tasks.sql);
// the database tests fail if the two drift. Decisions: docs/adr/0019.
import type { GroupActor } from './groups'
import type { UserLevel } from './review'

export const ACTIVITY_STATUSES = ['planned', 'active', 'done', 'cancelled'] as const
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number]

export const PARTICIPANT_ROLES = ['participant', 'observer'] as const
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number]

export const TASK_STATUSES = ['open', 'in_progress', 'done'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

/** The type of every group's standing General activity. */
export const GENERAL_ACTIVITY_TYPE = 'general'

export const ACTIVITY_TYPE_MAX_LENGTH = 40
export const ACTIVITY_TITLE_MAX_LENGTH = 120
export const ACTIVITY_DESCRIPTION_MAX_LENGTH = 2000
export const ACTIVITY_LINKS_MAX = 20
export const POSTMORTEM_FIELD_MAX_LENGTH = 4000
export const TASK_TITLE_MAX_LENGTH = 120
export const TASK_DESCRIPTION_MAX_LENGTH = 2000
export const TASK_COMPLETION_NOTE_MAX_LENGTH = 2000

/** Who is asking about one activity: their place in its group, and their link to the activity. */
export type ActivityActor = GroupActor & {
  isCreator: boolean
  isLead: boolean
}

const isFreshOrAbove = (level: UserLevel) => level === 'fresh' || level === 'experienced'

/** Activities and tasks: fresh or experienced members of the group, or an admin. */
export function canCreateInGroup({ level, isAdmin, isMember }: GroupActor): boolean {
  return isAdmin || (isMember && isFreshOrAbove(level))
}

/** An admin, or a member of the group who created the activity, leads it, or is experienced. */
export function canEditActivity(actor: ActivityActor): boolean {
  if (actor.isAdmin) return true
  return actor.isMember && (actor.isCreator || actor.isLead || actor.level === 'experienced')
}

/** An admin, or a member of the group who created the activity or is experienced. */
export function canArchiveActivity(actor: ActivityActor): boolean {
  if (actor.isAdmin) return true
  return actor.isMember && (actor.isCreator || actor.level === 'experienced')
}

/** The roles a person may join an activity with: new volunteers only observe. */
export function participantRoleFor(level: UserLevel, isAdmin: boolean): readonly ParticipantRole[] {
  return isAdmin || isFreshOrAbove(level) ? PARTICIPANT_ROLES : ['observer']
}

/** A row of list_group_activities: the limited view every active member sees (spec section 5). */
export type LimitedActivityRow = {
  id: string
  title: string
  status: string
  type: string
  key_activity: boolean
  is_general: boolean
  archived: boolean
}

/** What a page shows of an activity in the limited view: no description, details or tasks. */
export type LimitedActivity = {
  id: string
  title: string
  status: ActivityStatus
  type: string
  isKey: boolean
  isGeneral: boolean
  archived: boolean
}

const isActivityStatus = (value: string): value is ActivityStatus =>
  (ACTIVITY_STATUSES as readonly string[]).includes(value)

/** Turns limited-view rows into view models, General first, dropping rows with an unknown status. */
export function toLimitedActivities(rows: readonly LimitedActivityRow[]): LimitedActivity[] {
  return rows
    .filter((row) => isActivityStatus(row.status))
    .map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status as ActivityStatus,
      type: row.type,
      isKey: row.key_activity,
      isGeneral: row.is_general,
      archived: row.archived,
    }))
    .sort((a, b) => Number(b.isGeneral) - Number(a.isGeneral))
}

/** How server actions report a refusal from the activity and task functions, policies and guards. */
export type ActivityRefusal = 'notAllowed' | 'notFound' | 'invalid' | 'conflict' | 'unavailable'

/**
 * Maps a database error code to a refusal (codes listed at the top of
 * supabase/migrations/20261117152524_activities_policies.sql).
 */
export function refusalFromDbCode(code: string | undefined): ActivityRefusal {
  switch (code) {
    case '42501':
      return 'notAllowed'
    case 'P0002':
      return 'notFound'
    case '22023':
    case '23514':
    case '23502':
    case '22P02':
      return 'invalid'
    case '55000':
    case '23505':
      return 'conflict'
    default:
      return 'unavailable'
  }
}

/** Mirrors the tasks_done_needs_note_or_link constraint: a non-blank note or a link. */
export function hasCompletionEvidence(note: string | null, url: string | null): boolean {
  return (note ?? '').trim() !== '' || url !== null
}
