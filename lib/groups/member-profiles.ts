import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

export type MemberProfile = {
  displayName: string
  level: Database['public']['Enums']['user_level']
}

/**
 * Display names and levels of active members, by id, from the `members` view (visible to every
 * active member). The view has no declared relationship to the group tables, so it cannot be
 * embedded in their queries: read the rows first, then call this with their user ids and join the
 * two in code. Ids that are not active members are simply absent from the result.
 */
export async function readMemberProfiles(
  supabase: SupabaseClient<Database>,
  ids: readonly string[],
): Promise<Map<string, MemberProfile>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()
  const { data } = await supabase.from('members').select('id, display_name, level').in('id', unique)
  const profiles = new Map<string, MemberProfile>()
  for (const person of data ?? []) {
    if (person.id && person.display_name && person.level) {
      profiles.set(person.id, { displayName: person.display_name, level: person.level })
    }
  }
  return profiles
}
