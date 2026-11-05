import 'server-only'
import { DEFAULT_RETENTION_MONTHS } from '@/lib/domain/notice'
import { createClient } from '@/lib/supabase/server'

// The only `config` rows an anonymous visitor may read. The row-level-security policy
// `config_select_public_retention` (supabase/migrations/20261105130000_public_retention_config.sql)
// allows exactly these keys: keep the two lists in step.
const REJECTED_KEY = 'retention.rejected_applications_months'
const LEAVERS_KEY = 'retention.people_who_leave_months'

/**
 * Retention periods for the public privacy notice, from `config` (CLAUDE.md rule 11). It reads
 * with the ordinary row-level-security client: the policy above is what lets a visitor see these
 * two rows. If they cannot be read the notice shows the defaults rather than failing, and the
 * server log says so.
 */
export async function getRetentionMonths() {
  try {
    const { data, error } = await (
      await createClient()
    )
      .from('config')
      .select('key, value')
      .in('key', [REJECTED_KEY, LEAVERS_KEY])
    if (error) console.error('Privacy notice: could not read the retention periods from config')
    const months = (key: string, fallback: number) => {
      const value = data?.find((row) => row.key === key)?.value
      return typeof value === 'number' && value > 0 ? value : fallback
    }
    return {
      rejectedApplications: months(REJECTED_KEY, DEFAULT_RETENTION_MONTHS.rejectedApplications),
      leavers: months(LEAVERS_KEY, DEFAULT_RETENTION_MONTHS.leavers),
    }
  } catch {
    console.error('Privacy notice: could not read the retention periods from config')
    return DEFAULT_RETENTION_MONTHS
  }
}
