'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/authz'
import { requireWgMember } from '@/lib/authz/wg'
import {
  groupLinksSchema,
  meetingSchema,
  meetingTargetSchema,
  updateMeetingSchema,
} from '@/lib/domain/meetings'
import { createClient } from '@/lib/supabase/server'

export type MeetingState = {
  status:
    'idle' | 'added' | 'updated' | 'deleted' | 'invalid' | 'notFound' | 'notAllowed' | 'unavailable'
}

export type LinksState = {
  status: 'idle' | 'saved' | 'invalid' | 'notFound' | 'notAllowed' | 'unavailable'
}

const PG_INSUFFICIENT_PRIVILEGE = '42501'

const text = (formData: FormData, key: string) => {
  const value = formData.get(key)
  return typeof value === 'string' ? value : ''
}

/**
 * Meetings and the two group links are content that fresh and experienced members of the group and
 * admins may edit (`new` members read only). Every action here checks that first (a 404 for anyone
 * else), validates on the server and writes through the RLS client, so the database refuses the
 * same people again. No audit entry: these are not admin actions.
 */
export async function addMeeting(
  _previous: MeetingState,
  formData: FormData,
): Promise<MeetingState> {
  await requireUser()

  const parsed = meetingSchema.safeParse({
    groupId: text(formData, 'groupId'),
    startsAt: text(formData, 'startsAt'),
    meetingUrl: text(formData, 'meetingUrl'),
    agendaUrl: text(formData, 'agendaUrl'),
  })
  if (!parsed.success) return { status: 'invalid' }
  const { groupId, startsAt, meetingUrl, agendaUrl } = parsed.data

  const { member } = await requireWgMember(groupId, 'fresh')

  const supabase = await createClient()
  const { error } = await supabase.from('wg_meetings').insert({
    group_id: groupId,
    starts_at: startsAt,
    meeting_url: meetingUrl,
    agenda_url: agendaUrl,
    created_by: member.id,
  })
  if (error?.code === PG_INSUFFICIENT_PRIVILEGE) return { status: 'notAllowed' }
  if (error) return { status: 'unavailable' }

  revalidatePath('/groups/[slug]', 'page')
  return { status: 'added' }
}

export async function updateMeeting(
  _previous: MeetingState,
  formData: FormData,
): Promise<MeetingState> {
  await requireUser()

  const parsed = updateMeetingSchema.safeParse({
    groupId: text(formData, 'groupId'),
    meetingId: text(formData, 'meetingId'),
    startsAt: text(formData, 'startsAt'),
    meetingUrl: text(formData, 'meetingUrl'),
    agendaUrl: text(formData, 'agendaUrl'),
  })
  if (!parsed.success) return { status: 'invalid' }
  const { groupId, meetingId, startsAt, meetingUrl, agendaUrl } = parsed.data

  await requireWgMember(groupId, 'fresh')

  // Matching the group as well keeps a meeting of another group out of reach.
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('wg_meetings')
    .update({ starts_at: startsAt, meeting_url: meetingUrl, agenda_url: agendaUrl })
    .eq('id', meetingId)
    .eq('group_id', groupId)
    .select('id')
  if (error?.code === PG_INSUFFICIENT_PRIVILEGE) return { status: 'notAllowed' }
  if (error) return { status: 'unavailable' }
  if (!data || data.length === 0) return { status: 'notFound' }

  revalidatePath('/groups/[slug]', 'page')
  return { status: 'updated' }
}

export async function deleteMeeting(
  _previous: MeetingState,
  formData: FormData,
): Promise<MeetingState> {
  await requireUser()

  const parsed = meetingTargetSchema.safeParse({
    groupId: text(formData, 'groupId'),
    meetingId: text(formData, 'meetingId'),
  })
  if (!parsed.success) return { status: 'invalid' }
  const { groupId, meetingId } = parsed.data

  await requireWgMember(groupId, 'fresh')

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('wg_meetings')
    .delete()
    .eq('id', meetingId)
    .eq('group_id', groupId)
    .select('id')
  if (error?.code === PG_INSUFFICIENT_PRIVILEGE) return { status: 'notAllowed' }
  if (error) return { status: 'unavailable' }
  if (!data || data.length === 0) return { status: 'notFound' }

  revalidatePath('/groups/[slug]', 'page')
  return { status: 'deleted' }
}

/** Sets the Signal and docs links of a group; a blank field clears the link. Nothing else changes. */
export async function updateGroupLinks(
  _previous: LinksState,
  formData: FormData,
): Promise<LinksState> {
  await requireUser()

  const parsed = groupLinksSchema.safeParse({
    groupId: text(formData, 'groupId'),
    signalUrl: text(formData, 'signalUrl'),
    docsUrl: text(formData, 'docsUrl'),
  })
  if (!parsed.success) return { status: 'invalid' }
  const { groupId, signalUrl, docsUrl } = parsed.data

  await requireWgMember(groupId, 'fresh')

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('working_groups')
    .update({ signal_url: signalUrl, docs_url: docsUrl })
    .eq('id', groupId)
    .select('id')
  if (error?.code === PG_INSUFFICIENT_PRIVILEGE) return { status: 'notAllowed' }
  if (error) return { status: 'unavailable' }
  if (!data || data.length === 0) return { status: 'notFound' }

  revalidatePath('/groups/[slug]', 'page')
  return { status: 'saved' }
}
