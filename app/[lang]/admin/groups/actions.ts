'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { recordAudit } from '@/lib/audit'
import { requireAdmin } from '@/lib/authz'
import {
  changedGroupFields,
  createGroupSchema,
  groupMemberSchema,
  groupTargetSchema,
  onGroupCreated,
  updateGroupSchema,
} from '@/lib/domain/admin-groups'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export type GroupAdminState = {
  status: 'idle' | 'done' | 'invalid' | 'slugTaken' | 'notFound' | 'notActive' | 'unavailable'
  /** False when nothing changed (already in the requested state): nothing was audited either. */
  changed?: boolean
}

const PG_UNIQUE_VIOLATION = '23505'

const text = (formData: FormData, key: string) => {
  const value = formData.get(key)
  return typeof value === 'string' ? value : ''
}

const refresh = () => {
  revalidatePath('/[lang]/admin/groups', 'layout')
  revalidatePath('/[lang]/groups', 'layout')
}

/**
 * Only admins manage working groups. Every action starts with `requireAdmin()`, reads and writes
 * through the RLS client (the policies say admin only again) and uses the service-role client only
 * to append the audit entry. Audit details hold ids, slugs and field names, never personal data.
 */
export async function createGroup(
  _previous: GroupAdminState,
  formData: FormData,
): Promise<GroupAdminState> {
  const admin = await requireAdmin()

  const parsed = createGroupSchema.safeParse({
    name: text(formData, 'name'),
    slug: text(formData, 'slug'),
    description: text(formData, 'description'),
  })
  if (!parsed.success) return { status: 'invalid' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('working_groups')
    .insert(parsed.data)
    .select('id, slug')
    .single()
  if (error?.code === PG_UNIQUE_VIOLATION) return { status: 'slugTaken' }
  if (error || !data) return { status: 'unavailable' }

  await recordAudit(createAdminClient(), {
    actorId: admin.id,
    action: 'working_group.created',
    entityType: 'working_group',
    entityId: data.id,
    details: { slug: data.slug },
  })
  await onGroupCreated(data.id)
  refresh()
  redirect(`/admin/groups/${data.id}`)
}

/** Name, description and the two links. The slug is not an input: it never changes. */
export async function updateGroup(
  _previous: GroupAdminState,
  formData: FormData,
): Promise<GroupAdminState> {
  const admin = await requireAdmin()

  const parsed = updateGroupSchema.safeParse({
    groupId: text(formData, 'groupId'),
    name: text(formData, 'name'),
    description: text(formData, 'description'),
    signalUrl: text(formData, 'signalUrl'),
    docsUrl: text(formData, 'docsUrl'),
  })
  if (!parsed.success) return { status: 'invalid' }
  const { groupId, ...next } = parsed.data

  const supabase = await createClient()
  const { data: current, error: readError } = await supabase
    .from('working_groups')
    .select('slug, name, description, signal_url, docs_url')
    .eq('id', groupId)
    .maybeSingle()
  if (readError) return { status: 'unavailable' }
  if (!current) return { status: 'notFound' }

  const fields = changedGroupFields(current, next)
  if (fields.length === 0) return { status: 'done', changed: false }

  const { data, error } = await supabase
    .from('working_groups')
    .update({
      name: next.name,
      description: next.description,
      signal_url: next.signalUrl,
      docs_url: next.docsUrl,
    })
    .eq('id', groupId)
    .select('id')
  if (error) return { status: 'unavailable' }
  if (!data || data.length === 0) return { status: 'notFound' }

  await recordAudit(createAdminClient(), {
    actorId: admin.id,
    action: 'working_group.updated',
    entityType: 'working_group',
    entityId: groupId,
    details: { slug: current.slug, fields },
  })
  refresh()
  return { status: 'done', changed: true }
}

async function setArchived(formData: FormData, archive: boolean): Promise<GroupAdminState> {
  const admin = await requireAdmin()

  const parsed = groupTargetSchema.safeParse({ groupId: text(formData, 'groupId') })
  if (!parsed.success) return { status: 'invalid' }
  const { groupId } = parsed.data

  const supabase = await createClient()
  const base = supabase
    .from('working_groups')
    .update({ archived_at: archive ? new Date().toISOString() : null })
    .eq('id', groupId)
  // Only a group that is not yet in the requested state changes.
  const { data, error } = await (
    archive ? base.is('archived_at', null) : base.not('archived_at', 'is', null)
  ).select('id, slug')
  if (error) return { status: 'unavailable' }

  const changed = data?.[0]
  if (!changed) {
    const { data: existing, error: lookupError } = await supabase
      .from('working_groups')
      .select('id')
      .eq('id', groupId)
      .maybeSingle()
    if (lookupError) return { status: 'unavailable' }
    return existing ? { status: 'done', changed: false } : { status: 'notFound' }
  }

  await recordAudit(createAdminClient(), {
    actorId: admin.id,
    action: archive ? 'working_group.archived' : 'working_group.restored',
    entityType: 'working_group',
    entityId: groupId,
    details: { slug: changed.slug },
  })
  refresh()
  return { status: 'done', changed: true }
}

export async function archiveGroup(
  _previous: GroupAdminState,
  formData: FormData,
): Promise<GroupAdminState> {
  return setArchived(formData, true)
}

export async function restoreGroup(
  _previous: GroupAdminState,
  formData: FormData,
): Promise<GroupAdminState> {
  return setArchived(formData, false)
}

export async function addGroupMember(
  _previous: GroupAdminState,
  formData: FormData,
): Promise<GroupAdminState> {
  const admin = await requireAdmin()

  const parsed = groupMemberSchema.safeParse({
    groupId: text(formData, 'groupId'),
    userId: text(formData, 'userId'),
  })
  if (!parsed.success) return { status: 'invalid' }
  const { groupId, userId } = parsed.data

  const supabase = await createClient()
  const [groupResult, personResult] = await Promise.all([
    supabase.from('working_groups').select('slug').eq('id', groupId).maybeSingle(),
    supabase.from('users').select('id').eq('id', userId).eq('status', 'active').maybeSingle(),
  ])
  if (groupResult.error || personResult.error) return { status: 'unavailable' }
  if (!groupResult.data) return { status: 'notFound' }
  if (!personResult.data) return { status: 'notActive' }

  const { error } = await supabase
    .from('wg_members')
    .insert({ group_id: groupId, user_id: userId, added_by: admin.id })
  if (error?.code === PG_UNIQUE_VIOLATION) return { status: 'done', changed: false }
  if (error) return { status: 'unavailable' }

  await recordAudit(createAdminClient(), {
    actorId: admin.id,
    action: 'working_group.member_added',
    entityType: 'working_group',
    entityId: groupId,
    details: { slug: groupResult.data.slug, userId },
  })
  refresh()
  return { status: 'done', changed: true }
}

/** Removing is the only way to leave a group in v1 (no self-leave). Future lead weeks go with it. */
export async function removeGroupMember(
  _previous: GroupAdminState,
  formData: FormData,
): Promise<GroupAdminState> {
  const admin = await requireAdmin()

  const parsed = groupMemberSchema.safeParse({
    groupId: text(formData, 'groupId'),
    userId: text(formData, 'userId'),
  })
  if (!parsed.success) return { status: 'invalid' }
  const { groupId, userId } = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('wg_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .select('user_id')
  if (error) return { status: 'unavailable' }
  if (!data || data.length === 0) return { status: 'done', changed: false }

  await recordAudit(createAdminClient(), {
    actorId: admin.id,
    action: 'working_group.member_removed',
    entityType: 'working_group',
    entityId: groupId,
    details: { userId },
  })
  refresh()
  return { status: 'done', changed: true }
}
