import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { DEFAULT_RETENTION_MONTHS } from '@/lib/domain/notice'

/**
 * Retention periods for the public privacy notice, from `config` (CLAUDE.md rule 11). The page is
 * public and `config` is readable by members only, so this reads the two non-personal keys with
 * the service role. If they cannot be read the notice shows the defaults rather than failing.
 */
export async function getRetentionMonths() {
  try {
    const { data } = await createAdminClient()
      .from('config')
      .select('key, value')
      .in('key', ['retention.rejected_applications_months', 'retention.people_who_leave_months'])
    const months = (key: string, fallback: number) => {
      const value = data?.find((row) => row.key === key)?.value
      return typeof value === 'number' && value > 0 ? value : fallback
    }
    return {
      rejectedApplications: months(
        'retention.rejected_applications_months',
        DEFAULT_RETENTION_MONTHS.rejectedApplications,
      ),
      leavers: months('retention.people_who_leave_months', DEFAULT_RETENTION_MONTHS.leavers),
    }
  } catch {
    return DEFAULT_RETENTION_MONTHS
  }
}
