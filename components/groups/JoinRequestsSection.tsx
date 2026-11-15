import { LevelBadge } from '@/components/profile/LevelBadge'
import { Card } from '@/components/ui/display'
import { getFormatter, getTranslations } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'
import { JoinRequestActions } from './JoinRequestActions'

/**
 * Pending join requests of one group, for the people who may decide them. Row-level security
 * returns the requests of a group only to its approvers, so the query is a second line of defence
 * behind `canApprove` (the database's can_approve_join), which gates the whole section.
 */
export async function JoinRequestsSection({
  groupId,
  canApprove,
}: {
  groupId: string
  canApprove: boolean
}) {
  if (!canApprove) return null
  const t = await getTranslations('groups.requests')
  const format = await getFormatter()

  const supabase = await createClient()
  const { data } = await supabase
    .from('wg_join_requests')
    .select('id, created_at, members(display_name, level)')
    .eq('group_id', groupId)
    .eq('status', 'pending')
    .order('created_at')
  const requests = (data ?? []).flatMap((row) => {
    // The members view has no declared key, so the client types the embed as one row or a list.
    const person = Array.isArray(row.members) ? row.members[0] : row.members
    return person
      ? [{ id: row.id, createdAt: row.created_at, name: person.display_name, level: person.level }]
      : []
  })

  return (
    <section aria-labelledby="join-requests" className="flex flex-col gap-3">
      <h2 id="join-requests" className="text-xl font-bold">
        {t('title')}
      </h2>
      <p className="max-w-prose text-muted">{t('intro')}</p>
      {requests.length === 0 ? (
        <p>{t('empty')}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {requests.map((request) => (
            <li key={request.id}>
              <Card className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-semibold">{request.name}</span>
                  <LevelBadge level={request.level} />
                  <span className="text-sm text-muted">
                    {format.dateTime(new Date(request.createdAt), { dateStyle: 'medium' })}
                  </span>
                </div>
                <JoinRequestActions requestId={request.id} name={request.name} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
