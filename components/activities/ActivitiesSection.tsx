import Link from 'next/link'
import { buttonClasses } from '@/components/ui/Button'
import { Badge, Card, EmptyState } from '@/components/ui/display'
import { Select } from '@/components/ui/fields'
import { ACTIVITY_STATUSES, type ActivityStatus } from '@/lib/domain/activities'
import type { ActivityFilters } from '@/lib/domain/activity-input'
import { ACTIVITY_TYPES, getActivityType, parseDetailsLoosely } from '@/lib/domain/activity-types'
import { getFormatter, getTranslations } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'

const COLUMNS = 'id, type, title, status, due_on, key_activity, is_general, details'

/**
 * The Activities tab for members and admins: the group's non-archived activities (General first)
 * with filters by status and type, and a "New activity" button for people who may create (the
 * database's can_create_in_group, passed in). Row-level security hides the rows from everyone else.
 */
export async function ActivitiesSection({
  groupId,
  slug,
  filters,
  canCreate,
}: {
  groupId: string
  slug: string
  filters: ActivityFilters
  canCreate: boolean
}) {
  const t = await getTranslations('activities')
  const tt = await getTranslations('activityTypes')
  const format = await getFormatter()

  const supabase = await createClient()
  let query = supabase
    .from('activities')
    .select(COLUMNS)
    .eq('group_id', groupId)
    .is('archived_at', null)
    .order('is_general', { ascending: false })
    .order('created_at', { ascending: false })
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.type) query = query.eq('type', filters.type)
  const { data } = await query
  const rows = data ?? []

  const counts = new Map<string, number>()
  if (rows.length > 0) {
    const { data: participants } = await supabase
      .from('activity_participants')
      .select('activity_id')
      .in(
        'activity_id',
        rows.map((row) => row.id),
      )
    for (const row of participants ?? []) {
      counts.set(row.activity_id, (counts.get(row.activity_id) ?? 0) + 1)
    }
  }

  const filtered = filters.status !== null || filters.type !== null
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <form
          method="get"
          action={`/groups/${slug}`}
          className="flex flex-wrap items-end gap-3"
          aria-label={t('filters.label')}
        >
          <input type="hidden" name="tab" value="activities" />
          <label className="flex flex-col gap-1.5 font-semibold">
            {t('filters.status')}
            <Select name="status" defaultValue={filters.status ?? ''}>
              <option value="">{t('filters.all')}</option>
              {ACTIVITY_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`status.${status}`)}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1.5 font-semibold">
            {t('filters.type')}
            <Select name="type" defaultValue={filters.type ?? ''}>
              <option value="">{t('filters.all')}</option>
              {ACTIVITY_TYPES.map((type) => (
                <option key={type.key} value={type.key}>
                  {tt(type.labelKey as never)}
                </option>
              ))}
            </Select>
          </label>
          <button type="submit" className={buttonClasses('secondary')}>
            {t('filters.apply')}
          </button>
        </form>
        {canCreate && (
          <Link href={`/groups/${slug}/activities/new`} className={buttonClasses('primary')}>
            {t('newButton')}
          </Link>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={filtered ? t('noMatchesTitle') : t('emptyTitle')}
          description={filtered ? t('noMatchesBody') : t('emptyBody')}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => {
            const definition = getActivityType(row.type)
            const summary = definition
              ? definition.summarize(parseDetailsLoosely(row.type, row.details))
              : ''
            return (
              <li key={row.id}>
                <Card className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <Link
                      href={`/groups/${slug}/activities/${row.id}`}
                      className="text-lg font-bold underline"
                    >
                      {row.title}
                    </Link>
                    {row.key_activity && <Badge tone="brand">{t('keyMarker')}</Badge>}
                    <Badge>{t(`status.${row.status as ActivityStatus}`)}</Badge>
                  </div>
                  <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                    <span>{definition ? tt(definition.labelKey as never) : row.type}</span>
                    {row.due_on && (
                      <span>
                        {t('due', {
                          date: format.dateTime(new Date(`${row.due_on}T12:00:00Z`), {
                            dateStyle: 'medium',
                          }),
                        })}
                      </span>
                    )}
                    <span>{t('participantCount', { count: counts.get(row.id) ?? 0 })}</span>
                  </p>
                  {summary && <p className="break-words">{summary}</p>}
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** The limited view of a group's activities, for people who are not members: titles and statuses. */
export async function LimitedActivities({ groupId }: { groupId: string }) {
  const t = await getTranslations('activities')
  const supabase = await createClient()
  const { data } = await supabase.rpc('list_group_activities', { p_group: groupId })
  const rows = (data ?? []).filter((row) => !row.archived)
  if (rows.length === 0) return null

  return (
    <section aria-labelledby="limited-activities" className="flex flex-col gap-3">
      <h2 id="limited-activities" className="text-xl font-bold">
        {t('limitedTitle')}
      </h2>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center gap-3">
            <span className="font-semibold">{row.title}</span>
            <Badge>{t(`status.${row.status}`)}</Badge>
          </li>
        ))}
      </ul>
    </section>
  )
}
