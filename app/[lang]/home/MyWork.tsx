import Link from 'next/link'
import { Badge, Card } from '@/components/ui/display'
import { selectMyActivities, selectOpenTasks } from '@/lib/domain/my-work'
import { getFormatter, getTranslations } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'

/**
 * "My work" on /home: the member's own open tasks and the current activities they take part in.
 * Read with the member's session and filtered to their own rows; a few small queries, no N+1.
 */
export async function MyWork({ userId }: { userId: string }) {
  const t = await getTranslations('home.work')
  const ts = await getTranslations('tasks.status')
  const ta = await getTranslations('activities.status')
  const format = await getFormatter()
  const supabase = await createClient()

  const [{ data: taskRows }, { data: participation }] = await Promise.all([
    supabase
      .from('tasks')
      .select('id, title, status, due_on, created_at, activity_id, group_id')
      .eq('assignee_id', userId)
      .in('status', ['open', 'in_progress'])
      .limit(100),
    supabase.from('activity_participants').select('activity_id').eq('user_id', userId).limit(200),
  ])
  const tasks = selectOpenTasks(taskRows ?? [])

  const participatingIds = (participation ?? []).map((row) => row.activity_id)
  const activityIds = [...new Set([...participatingIds, ...tasks.map((task) => task.activity_id)])]
  const { data: activityRows } = activityIds.length
    ? await supabase
        .from('activities')
        .select('id, title, status, group_id, is_general, archived_at')
        .in('id', activityIds)
    : { data: [] }
  const activityById = new Map((activityRows ?? []).map((row) => [row.id, row]))
  const activities = selectMyActivities(
    (activityRows ?? []).filter((row) => participatingIds.includes(row.id)),
  )

  const groupIds = [
    ...new Set([...tasks.map((task) => task.group_id), ...activities.map((row) => row.group_id)]),
  ]
  const { data: groupRows } = groupIds.length
    ? await supabase.from('working_groups').select('id, name, slug').in('id', groupIds)
    : { data: [] }
  const groupById = new Map((groupRows ?? []).map((row) => [row.id, row]))

  const day = (value: string) =>
    format.dateTime(new Date(`${value}T12:00:00Z`), { dateStyle: 'medium' })

  return (
    <section aria-labelledby="my-work-heading" className="flex flex-col gap-4">
      <h2 id="my-work-heading" className="text-2xl font-bold">
        {t('title')}
      </h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="flex flex-col gap-3" aria-labelledby="my-work-tasks-heading">
          <h3 id="my-work-tasks-heading" className="text-lg font-bold">
            {t('tasksTitle')}
          </h3>
          {tasks.length === 0 ? (
            <p>{t('tasksEmpty')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {tasks.map((task) => {
                const group = groupById.get(task.group_id)
                const known = group && activityById.has(task.activity_id)
                return (
                  <li key={task.id} className="flex flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      {known ? (
                        <Link
                          href={`/groups/${group.slug}/activities/${task.activity_id}`}
                          className="font-semibold underline"
                        >
                          {task.title}
                        </Link>
                      ) : (
                        <span className="font-semibold">{task.title}</span>
                      )}
                      <Badge>{ts(task.status as 'open' | 'in_progress')}</Badge>
                    </span>
                    {task.due_on && (
                      <span className="text-sm text-muted">
                        {t('due', { date: day(task.due_on) })}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          <Link href="/tasks" className="font-semibold underline">
            {t('allTasks')}
          </Link>
        </Card>

        <Card className="flex flex-col gap-3" aria-labelledby="my-work-activities-heading">
          <h3 id="my-work-activities-heading" className="text-lg font-bold">
            {t('activitiesTitle')}
          </h3>
          {activities.length === 0 ? (
            <p>{t('activitiesEmpty')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {activities.map((activity) => {
                const group = groupById.get(activity.group_id)
                return (
                  <li key={activity.id} className="flex flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      {group ? (
                        <Link
                          href={`/groups/${group.slug}/activities/${activity.id}`}
                          className="font-semibold underline"
                        >
                          {activity.title}
                        </Link>
                      ) : (
                        <span className="font-semibold">{activity.title}</span>
                      )}
                      <Badge>{ta(activity.status as 'planned' | 'active')}</Badge>
                    </span>
                    {group && <span className="text-sm text-muted">{group.name}</span>}
                  </li>
                )
              })}
            </ul>
          )}
          <Link href="/groups" className="font-semibold underline">
            {t('allGroups')}
          </Link>
        </Card>
      </div>
    </section>
  )
}
