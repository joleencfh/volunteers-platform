'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireUser } from '@/lib/authz'
import { requireWgMember } from '@/lib/authz/wg'
import type { Json } from '@/lib/database.types'
import { PARTICIPANT_ROLES, participantRoleFor, refusalFromDbCode } from '@/lib/domain/activities'
import { parseActivityCommon, readDetails } from '@/lib/domain/activity-input'
import { getActivityType } from '@/lib/domain/activity-types'
import { isValidSlug } from '@/lib/domain/groups'
import { createClient } from '@/lib/supabase/server'

export type CreateActivityState = {
  status: 'idle' | 'invalid' | 'invalidType' | 'invalidDetails' | 'notAllowed' | 'unavailable'
}

const targetSchema = z.object({
  groupId: z.uuid(),
  slug: z.string().refine(isValidSlug),
})

const text = (formData: FormData, key: string) => {
  const value = formData.get(key)
  return typeof value === 'string' ? value : ''
}

/**
 * Creates an activity of a selectable type in a group and adds the creator as a participant.
 * Fresh and experienced members of the group and admins may (a `new` volunteer gets the 404 from
 * `requireWgMember`); the database refuses anyone else again. The General type is created by the
 * database only, so it is never accepted here.
 */
export async function createActivity(
  _previous: CreateActivityState,
  formData: FormData,
): Promise<CreateActivityState> {
  await requireUser()

  const target = targetSchema.safeParse({
    groupId: text(formData, 'groupId'),
    slug: text(formData, 'slug'),
  })
  if (!target.success) return { status: 'invalid' }
  const { groupId, slug } = target.data

  const { member } = await requireWgMember(groupId, 'fresh')

  const definition = getActivityType(text(formData, 'type'))
  if (!definition || !definition.selectable) return { status: 'invalidType' }

  const common = parseActivityCommon(formData)
  if (!common.ok) return { status: 'invalid' }
  const details = definition.detailsSchema.safeParse(readDetails(definition.fields, formData))
  if (!details.success) return { status: 'invalidDetails' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('activities')
    .insert({
      group_id: groupId,
      type: definition.key,
      title: common.data.title,
      description: common.data.description ?? null,
      status: common.data.status,
      starts_on: common.data.startsOn ?? null,
      due_on: common.data.dueOn ?? null,
      key_activity: common.data.keyActivity,
      links: common.data.links,
      details: details.data as NonNullable<Json>,
      created_by: member.id,
    })
    .select('id')
    .single()
  if (error || !data) {
    const refusal = refusalFromDbCode(error?.code)
    if (refusal === 'notAllowed') return { status: 'notAllowed' }
    if (refusal === 'invalid') return { status: 'invalid' }
    return { status: 'unavailable' }
  }

  // The creator takes part from the start. Failing here leaves a valid activity, so it is not fatal.
  await supabase.rpc('join_activity', { p_activity: data.id, p_role: 'participant' })

  revalidatePath('/groups/[slug]', 'page')
  redirect(`/groups/${slug}/activities/${data.id}`)
}

// Managing one activity (T-03 part 2) ------------------------------------------------------------

export type ActivityActionState = {
  status:
    | 'idle'
    | 'done'
    | 'invalid'
    | 'invalidType'
    | 'invalidDetails'
    | 'general'
    | 'notAllowed'
    | 'notFound'
    | 'conflict'
    | 'unavailable'
}

const activityTargetSchema = z.object({
  groupId: z.uuid(),
  slug: z.string().refine(isValidSlug),
  activityId: z.uuid(),
})

type Loaded = {
  id: string
  type: string
  is_general: boolean
  archived_at: string | null
}

/**
 * The common start of every action on one activity: sign-in, then membership of the group (an admin
 * passes), then the activity itself, read with the RLS client so a person who may not see it gets
 * "not found". Returns a typed state when the input or the activity is not usable.
 */
async function loadActivity(
  formData: FormData,
): Promise<
  | { ok: true; member: Awaited<ReturnType<typeof requireUser>>; activity: Loaded }
  | { ok: false; state: ActivityActionState }
> {
  await requireUser()
  const target = activityTargetSchema.safeParse({
    groupId: text(formData, 'groupId'),
    slug: text(formData, 'slug'),
    activityId: text(formData, 'activityId'),
  })
  if (!target.success) return { ok: false, state: { status: 'invalid' } }
  const { member } = await requireWgMember(target.data.groupId)

  const supabase = await createClient()
  const { data } = await supabase
    .from('activities')
    .select('id, type, is_general, archived_at')
    .eq('id', target.data.activityId)
    .eq('group_id', target.data.groupId)
    .maybeSingle()
  if (!data) return { ok: false, state: { status: 'notFound' } }
  return { ok: true, member, activity: data }
}

function refreshActivity() {
  revalidatePath('/groups/[slug]', 'page')
  revalidatePath('/groups/[slug]/activities/[id]', 'page')
}

const fromDbCode = (code: string | undefined): ActivityActionState => ({
  status: refusalFromDbCode(code),
})

/**
 * Edits an activity: common fields and the type's details. The type never changes. The General
 * activity and archived ones are refused here; the update policy decides who else may edit (the
 * creator, the lead, experienced members and admins), and a row it hides comes back empty.
 */
export async function updateActivity(
  _previous: ActivityActionState,
  formData: FormData,
): Promise<ActivityActionState> {
  const loaded = await loadActivity(formData)
  if (!loaded.ok) return loaded.state
  const { activity } = loaded
  if (activity.is_general) return { status: 'general' }
  if (activity.archived_at) return { status: 'conflict' }

  const definition = getActivityType(activity.type)
  if (!definition || !definition.selectable) return { status: 'invalidType' }
  const common = parseActivityCommon(formData)
  if (!common.ok) return { status: 'invalid' }
  const details = definition.detailsSchema.safeParse(readDetails(definition.fields, formData))
  if (!details.success) return { status: 'invalidDetails' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('activities')
    .update({
      title: common.data.title,
      description: common.data.description ?? null,
      status: common.data.status,
      starts_on: common.data.startsOn ?? null,
      due_on: common.data.dueOn ?? null,
      key_activity: common.data.keyActivity,
      links: common.data.links,
      details: details.data as NonNullable<Json>,
    })
    .eq('id', activity.id)
    .select('id')
    .maybeSingle()
  if (error) return fromDbCode(error.code)
  // Row-level security filtered the row out: the person may read it but not edit it.
  if (!data) return { status: 'notAllowed' }

  refreshActivity()
  return { status: 'done' }
}

async function setArchived(formData: FormData, archive: boolean): Promise<ActivityActionState> {
  const loaded = await loadActivity(formData)
  if (!loaded.ok) return loaded.state
  const { activity } = loaded
  if (activity.is_general) return { status: 'general' }
  if ((activity.archived_at !== null) === archive) return { status: 'done' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('activities')
    .update({ archived_at: archive ? new Date().toISOString() : null })
    .eq('id', activity.id)
    .select('id')
    .maybeSingle()
  if (error) return fromDbCode(error.code)
  if (!data) return { status: 'notAllowed' }

  refreshActivity()
  return { status: 'done' }
}

/** Archives an activity: hidden from the default lists, kept, restorable. The General one cannot be. */
export async function archiveActivity(
  _previous: ActivityActionState,
  formData: FormData,
): Promise<ActivityActionState> {
  return setArchived(formData, true)
}

/** Brings an archived activity back. */
export async function restoreActivity(
  _previous: ActivityActionState,
  formData: FormData,
): Promise<ActivityActionState> {
  return setArchived(formData, false)
}

/**
 * Joins the signed-in person to an activity, or changes their role. A new volunteer may only observe
 * (checked here for a typed state, and again by join_activity in the database).
 */
export async function joinActivity(
  _previous: ActivityActionState,
  formData: FormData,
): Promise<ActivityActionState> {
  const loaded = await loadActivity(formData)
  if (!loaded.ok) return loaded.state
  const { member, activity } = loaded
  const role = z.enum(PARTICIPANT_ROLES).safeParse(text(formData, 'role'))
  if (!role.success) return { status: 'invalid' }
  if (!participantRoleFor(member.level, member.isAdmin).includes(role.data)) {
    return { status: 'notAllowed' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('join_activity', {
    p_activity: activity.id,
    p_role: role.data,
  })
  if (error) return fromDbCode(error.code)

  refreshActivity()
  return { status: 'done' }
}

/** Removes the signed-in person from an activity; a lead who leaves stops being the lead. */
export async function leaveActivity(
  _previous: ActivityActionState,
  formData: FormData,
): Promise<ActivityActionState> {
  const loaded = await loadActivity(formData)
  if (!loaded.ok) return loaded.state
  const { activity } = loaded

  const supabase = await createClient()
  const { error } = await supabase.rpc('leave_activity', { p_activity: activity.id })
  if (error) return fromDbCode(error.code)

  refreshActivity()
  return { status: 'done' }
}

/**
 * Sets the lead of an activity, or clears it (empty user id). set_activity_lead checks that the
 * caller may edit the activity and that the lead is a participant (not an observer) of the group.
 */
export async function setActivityLead(
  _previous: ActivityActionState,
  formData: FormData,
): Promise<ActivityActionState> {
  const loaded = await loadActivity(formData)
  if (!loaded.ok) return loaded.state
  const { activity } = loaded
  if (activity.is_general) return { status: 'general' }
  const raw = text(formData, 'userId')
  const user = raw === '' ? { success: true as const, data: null } : z.uuid().safeParse(raw)
  if (!user.success) return { status: 'invalid' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('set_activity_lead', {
    p_activity: activity.id,
    p_user: user.data as string,
  })
  if (error) return fromDbCode(error.code)

  refreshActivity()
  return { status: 'done' }
}
