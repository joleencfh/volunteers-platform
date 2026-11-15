import 'server-only'
import { notFound } from 'next/navigation'
import type { Database } from '@/lib/database.types'
import { canApproveJoin, canAssignLead } from '@/lib/domain/groups'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from './index'
import type { Member } from './member'

type MinLevel = Exclude<Database['public']['Enums']['user_level'], 'new'>

export type WgMembership = { groupId: string; joinedAt: string }

/**
 * The signed-in member, who must belong to the working group (an admin passes for every group). With
 * `minLevel`, a member below that level is refused too: 'fresh' lets fresh and experienced members
 * through, 'experienced' only experienced ones. A refusal is a 404, as `requireAdmin` does, so the
 * page or action looks as if it did not exist. Server actions call this right after `requireUser`.
 */
export async function requireWgMember(
  groupId: string,
  minLevel?: MinLevel,
): Promise<{ member: Member; membership: WgMembership | null }> {
  const member = await requireUser()

  // Row-level security shows a person their own membership row, and nobody else's unless they share
  // the group, so this lookup cannot reveal other people.
  const supabase = await createClient()
  const { data } = await supabase
    .from('wg_members')
    .select('group_id, joined_at, working_groups!inner(archived_at)')
    .eq('group_id', groupId)
    .eq('user_id', member.id)
    .maybeSingle()
  const group = Array.isArray(data?.working_groups) ? data.working_groups[0] : data?.working_groups
  const isMember = Boolean(data) && group?.archived_at === null

  const actor = { level: member.level, isAdmin: member.isAdmin, isMember }
  const allowed =
    minLevel === 'experienced'
      ? canAssignLead(actor)
      : minLevel === 'fresh'
        ? canApproveJoin(actor)
        : member.isAdmin || isMember
  if (!allowed) notFound()

  return {
    member,
    membership: data && isMember ? { groupId: data.group_id, joinedAt: data.joined_at } : null,
  }
}
