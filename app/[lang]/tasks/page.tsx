import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { Badge, Card, EmptyState } from '@/components/ui/display'
import { requireUser } from '@/lib/authz'
import { compareByDue, type TaskStatus } from '@/lib/domain/tasks'
import { getFormatter, getTranslations } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'

export default function MyTasksPage() {
  return (
    <Suspense fallback={null}>
      <MyTasksContent />
    </Suspense>
  )
}

async function MyTasksContent() {
  // The session is read with a timestamp, so wait for the request instead of prerendering.
  await connection()
  const member = await requireUser()
  const t = await getTranslations('tasks')
  const ts = await getTranslations('tasks.status')
  const format = await getFormatter()

  // Only the signed-in member's own open and in-progress tasks, in every group they belong to.
  const supabase = await createClient()
  const { data } = await supabase
    .from('tasks')
    .select('id, title, status, due_on, created_at, activity_id, group_id')
    .eq('assignee_id', member.id)
    .in('status', ['open', 'in_progress'])
    .limit(200)
  const tasks = [...(data ?? [])].sort(compareByDue)

  // Names of the activities and groups, read separately (no embedded selects).
  const activityIds = [...new Set(tasks.map((task) => task.activity_id))]
  const groupIds = [...new Set(tasks.map((task) => task.group_id))]
  const [activities, groups] = await Promise.all([
    activityIds.length
      ? supabase.from('activities').select('id, title').in('id', activityIds)
      : { data: [] },
    groupIds.length
      ? supabase.from('working_groups').select('id, name, slug').in('id', groupIds)
      : { data: [] },
  ])
  const activityTitle = new Map((activities.data ?? []).map((row) => [row.id, row.title]))
  const groupById = new Map((groups.data ?? []).map((row) => [row.id, row]))

  const day = (value: string) =>
    format.dateTime(new Date(`${value}T12:00:00Z`), { dateStyle: 'medium' })

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold">{t('myTitle')}</h1>
        <p className="max-w-prose text-muted">{t('myIntro')}</p>
      </div>

      {tasks.length === 0 ? (
        <EmptyState title={t('myEmptyTitle')} description={t('myEmptyBody')} />
      ) : (
        <ul className="flex flex-col gap-3">
          {tasks.map((task) => {
            const group = groupById.get(task.group_id)
            const title = activityTitle.get(task.activity_id)
            return (
              <li key={task.id}>
                <Card className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-lg font-bold">{task.title}</h2>
                    <Badge>{ts(task.status as TaskStatus)}</Badge>
                  </div>
                  <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                    {task.due_on && <span>{t('due', { date: day(task.due_on) })}</span>}
                    {group && title && (
                      <Link
                        href={`/groups/${group.slug}/activities/${task.activity_id}`}
                        className="underline"
                      >
                        {t('inActivity', { title })}
                      </Link>
                    )}
                    {group && (
                      <Link href={`/groups/${group.slug}?tab=tasks`} className="underline">
                        {group.name}
                      </Link>
                    )}
                  </p>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
