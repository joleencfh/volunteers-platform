import { Card } from '@/components/ui/display'
import { LEAD_CHECKLIST, assignableWeeks, currentWeekStart, historyWeeks } from '@/lib/domain/leads'
import { readMemberProfiles } from '@/lib/groups/member-profiles'
import { getFormatter, getTranslations } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'
import { AssignLeadForm } from './AssignLeadForm'

/**
 * The lead of the week on a group's overview: who it is, the checklist, a short history and, for
 * people who may assign (the database's can_assign_lead, passed in), the assign form. Only rendered
 * for members and admins; row-level security hides the lead rows and the member list from everyone
 * else anyway.
 */
export async function LeadSection({
  groupId,
  canAssign,
  currentLead,
}: {
  groupId: string
  canAssign: boolean
  currentLead: { displayName: string } | null
}) {
  const t = await getTranslations('groups.leadWeek')
  const format = await getFormatter()
  // Compared with the database's week (Monday, UTC), not the viewer's calendar.
  const now = new Date()
  const current = currentWeekStart(now)
  const weeks = historyWeeks(now)
  const oldest = weeks[weeks.length - 1] as string

  const supabase = await createClient()
  const { data } = await supabase
    .from('wg_leads')
    .select('week_start, user_id')
    .eq('group_id', groupId)
    .gte('week_start', oldest)
    .order('week_start', { ascending: false })
  const leadProfiles = await readMemberProfiles(
    supabase,
    (data ?? []).map((row) => row.user_id),
  )
  const leads = (data ?? []).flatMap((row) => {
    const person = leadProfiles.get(row.user_id)
    return person ? [{ weekStart: row.week_start, name: person.displayName }] : []
  })
  const upcoming = leads.filter((lead) => lead.weekStart > current).reverse()
  const history = leads.filter((lead) => lead.weekStart <= current)

  let people: { id: string; name: string }[] = []
  if (canAssign) {
    const { data: rows } = await supabase
      .from('wg_members')
      .select('user_id')
      .eq('group_id', groupId)
    const memberProfiles = await readMemberProfiles(
      supabase,
      (rows ?? []).map((row) => row.user_id),
    )
    people = (rows ?? [])
      .flatMap((row) => {
        const person = memberProfiles.get(row.user_id)
        return person ? [{ id: row.user_id, name: person.displayName }] : []
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  const dateOf = (week: string) =>
    format.dateTime(new Date(`${week}T00:00:00Z`), { dateStyle: 'medium', timeZone: 'UTC' })

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-xl font-bold">{t('title')}</h2>
      <p className="font-semibold">
        {currentLead ? `${t('current')}: ${currentLead.displayName}` : t('none')}
      </p>
      <p className="max-w-prose text-muted">{t('noExtraPermissions')}</p>

      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-bold">{t('checklistTitle')}</h3>
        <ul className="flex max-w-prose list-disc flex-col gap-1 pl-6">
          {LEAD_CHECKLIST.map((key) => (
            <li key={key}>{t(`checklist.${key}`)}</li>
          ))}
        </ul>
      </div>

      {upcoming.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-bold">{t('upcomingTitle')}</h3>
          <ul className="flex flex-col gap-1">
            {upcoming.map((lead) => (
              <li key={lead.weekStart}>
                {t('historyRow', { date: dateOf(lead.weekStart), name: lead.name })}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-bold">{t('historyTitle')}</h3>
        {history.length === 0 ? (
          <p>{t('historyEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {history.map((lead) => (
              <li key={lead.weekStart}>
                {t('historyRow', { date: dateOf(lead.weekStart), name: lead.name })}
              </li>
            ))}
          </ul>
        )}
      </div>

      {canAssign && (
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-bold">{t('assignTitle')}</h3>
          <AssignLeadForm groupId={groupId} members={people} weeks={assignableWeeks(now)} />
        </div>
      )}
    </Card>
  )
}
