import type { SupabaseClient } from '@supabase/supabase-js'
import type { CurrentActivity } from '@/components/onboarding/CurrentActivitiesList'
import type { Database } from '@/lib/database.types'
import { CURRENT_ACTIVITIES_LIMIT, selectCurrentActivities } from '@/lib/domain/my-work'

/**
 * The activities listed in the onboarding window of step 4, read with the member's own session.
 * A member of working groups sees the current activities of those groups; a member of none sees
 * the limited view (titles and statuses) of every group, so the step stays completable.
 */
export async function readCurrentActivities(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<CurrentActivity[]> {
  const { data: memberships } = await supabase
    .from('wg_members')
    .select('group_id')
    .eq('user_id', userId)
  const groupIds = (memberships ?? []).map((row) => row.group_id)

  if (groupIds.length > 0) {
    const { data } = await supabase
      .from('activities')
      .select('id, title, status, group_id, is_general, archived_at')
      .in('group_id', groupIds)
      .in('status', ['planned', 'active'])
      .is('archived_at', null)
      .eq('is_general', false)
      .limit(100)
    const rows = selectCurrentActivities(data ?? [])
    if (rows.length === 0) return []
    const { data: groups } = await supabase
      .from('working_groups')
      .select('id, name')
      .in('id', [...new Set(rows.map((row) => row.group_id))])
    const names = new Map((groups ?? []).map((group) => [group.id, group.name]))
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      groupName: names.get(row.group_id),
    }))
  }

  // No group yet: the limited view of every active group.
  const { data: groups } = await supabase.rpc('list_working_groups')
  const open = (groups ?? []).filter((group) => !group.archived).slice(0, 20)
  const lists = await Promise.all(
    open.map(async (group) => {
      const { data } = await supabase.rpc('list_group_activities', { p_group: group.id })
      return (data ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status as string,
        group_id: group.id,
        groupName: group.name,
        is_general: row.is_general,
        archived_at: row.archived ? 'archived' : null,
      }))
    }),
  )
  return selectCurrentActivities(lists.flat(), CURRENT_ACTIVITIES_LIMIT).map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    groupName: row.groupName,
  }))
}
