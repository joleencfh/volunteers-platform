import Link from 'next/link'
import { Badge, Card, EmptyState } from '@/components/ui/display'
import { toProfileWorkItems } from '@/lib/domain/profile-work'
import { getFormatter, getTranslations } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'

/**
 * "Latest and planned work" on a profile (spec section 7). get_profile_work filters the rows in
 * the database to groups the viewer can fully see, with the viewer's own session; this component
 * shows exactly what came back. No names of other people appear.
 */
export async function ProfileWorkFeed({ ownerId, own }: { ownerId: string; own: boolean }) {
  const t = await getTranslations('profile.work')
  const ta = await getTranslations('activities.status')
  const ts = await getTranslations('tasks.status')
  const format = await getFormatter()
  const supabase = await createClient()

  const { data } = await supabase.rpc('get_profile_work', { p_owner: ownerId })
  const items = toProfileWorkItems(data ?? [])

  const day = (value: string) =>
    format.dateTime(new Date(`${value}T12:00:00Z`), { dateStyle: 'medium' })

  return (
    <section aria-labelledby="activity-heading" className="flex flex-col gap-3">
      <h2 id="activity-heading" className="text-2xl font-bold">
        {t('title')}
      </h2>
      {items.length === 0 ? (
        <EmptyState title={own ? t('emptyOwn') : t('empty')} />
      ) : (
        <Card>
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <li key={`${item.kind}-${item.id}`} className="flex flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <Badge>{item.kind === 'activity' ? t('kindActivity') : t('kindTask')}</Badge>
                  <Link href={item.href} className="font-semibold underline">
                    {item.title}
                  </Link>
                  <Badge tone={item.isCurrent ? 'brand' : 'neutral'}>
                    {item.kind === 'activity' ? ta(item.status) : ts(item.status)}
                  </Badge>
                </span>
                <span className="text-sm text-muted">
                  {item.kind === 'task' && item.activityTitle
                    ? t('taskIn', { activity: item.activityTitle, group: item.groupName })
                    : item.groupName}
                  {item.dueOn && ` · ${t('due', { date: day(item.dueOn) })}`}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  )
}
