import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { isEmailVerified, mayEnter } from '@/lib/domain/membership'

export type Member = {
  id: string
  email: string
  displayName: string
  level: Database['public']['Enums']['user_level']
  isAdmin: boolean
}

/**
 * The member record for a signed-in identity, or null if this person may not enter: no row under
 * their id (row-level security hides everyone else's), a deactivated user, an email that does not
 * match, or an email the provider has not verified. The admin flag is read from the database,
 * never from the token.
 */
export async function findMember(
  supabase: SupabaseClient<Database>,
  user: User,
): Promise<Member | null> {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, display_name, level, is_admin, status')
    .eq('id', user.id)
    .maybeSingle()
  if (error || !data) return null
  if (!mayEnter({ email: user.email, verified: isEmailVerified(user) }, data)) return null
  return {
    id: data.id,
    email: data.email,
    displayName: data.display_name,
    level: data.level,
    isAdmin: data.is_admin,
  }
}
