import Link from 'next/link'
import { buttonClasses } from '@/components/ui/Button'
import { Badge, Card, EmptyState } from '@/components/ui/display'
import { Select } from '@/components/ui/fields'
import { canCreateInGroup } from '@/lib/domain/activities'
import type { UserLevel } from '@/lib/domain/review'
import {
  TASK_STATUSES,
  assigneeFilterValue,
  canAssignTask,
  canComplete,
  canReopen,
  canTake,
  compareByDue,
  nextStatuses,
  type TaskFilters,
  type TaskStatus,
} from '@/lib/domain/tasks'
import { readMemberProfiles } from '@/lib/groups/member-profiles'
import { getFormatter, getTranslations } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'
import { CreateTaskForm } from './CreateTaskForm'
import { TaskControls } from './TaskControls'

export type TaskViewer = { id: string; level: UserLevel; isAdmin: boolean; isMember: boolean }

const COLUMNS =
  'id, activity_id, title, description, status, assignee_id, due_on, created_by, completion_note, completion_url, created_at'

/**
 * The tasks of a group, for members and admins. With `activityId` it is the Tasks section of that
 * activity (plus the create form when the person may create); without, it is the group's Tasks tab
 * across activities with filters. Names are read with `readMemberProfiles` (the members view cannot be
 * embedded), the controls of each row come from the pure rules in lib/domain/tasks.ts, and the
 * database and the actions check the same rules again.
 */
export async function GroupTasks({
  groupId,
  slug,
  viewer,
  activityId,
  activityOpen = true,
  filters,
}: {
  groupId: string
  slug: string
  viewer: TaskViewer
  activityId?: string
  /** False for an archived activity: no new tasks there. */
  activityOpen?: boolean
  filters?: TaskFilters
}) {
  const t = await getTranslations('tasks')
  const ts = await getTranslations('tasks.status')
  const format = await getFormatter()

  const supabase = await createClient()
  let query = supabase.from('tasks').select(COLUMNS).eq('group_id', groupId)
  if (activityId) query = query.eq('activity_id', activityId)
  if (filters?.status) query = query.eq('status', filters.status)
  const assignee = filters?.assignee ?? null
  if (assignee === 'me') query = query.eq('assignee_id', viewer.id)
  else if (assignee === 'unassigned') query = query.is('assignee_id', null)
  else if (assignee) query = query.eq('assignee_id', assignee.userId)
  const { data } = await query
  const rows = [...(data ?? [])].sort((a, b) => {
    const doneFirst = Number(a.status === 'done') - Number(b.status === 'done')
    return doneFirst !== 0 ? doneFirst : compareByDue(a, b)
  })

  // The group's members: names for the list and the people a task can be assigned to.
  const { data: memberships } = await supabase
    .from('wg_members')
    .select('user_id, joined_at')
    .eq('group_id', groupId)
    .order('joined_at')
  const memberIds = (memberships ?? []).map((row) => row.user_id)
  const profiles = await readMemberProfiles(supabase, [
    ...memberIds,
    ...rows.flatMap((row) => (row.assignee_id ? [row.assignee_id] : [])),
  ])
  const candidates = memberIds.flatMap((id) => {
    const profile = profiles.get(id)
    return profile ? [{ id, label: profile.displayName }] : []
  })

  // Titles of the activities, for the group-wide list.
  const activityTitles = new Map<string, string>()
  if (!activityId && rows.length > 0) {
    const { data: activities } = await supabase
      .from('activities')
      .select('id, title')
      .in('id', [...new Set(rows.map((row) => row.activity_id))])
    for (const activity of activities ?? []) activityTitles.set(activity.id, activity.title)
  }

  const mayCreate =
    Boolean(activityId) &&
    activityOpen &&
    canCreateInGroup({ level: viewer.level, isAdmin: viewer.isAdmin, isMember: viewer.isMember })
  const day = (value: string) =>
    format.dateTime(new Date(`${value}T12:00:00Z`), { dateStyle: 'medium' })
  const filtered = filters !== undefined && (filters.status !== null || filters.assignee !== null)

  return (
    <div className="flex flex-col gap-6">
      {!activityId && filters && (
        <form
          method="get"
          action={`/groups/${slug}`}
          className="flex flex-wrap items-end gap-3"
          aria-label={t('filters.label')}
        >
          <input type="hidden" name="tab" value="tasks" />
          <label className="flex flex-col gap-1.5 font-semibold">
            {t('filters.status')}
            <Select name="status" defaultValue={filters.status ?? ''}>
              <option value="">{t('filters.all')}</option>
              {TASK_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {ts(status)}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1.5 font-semibold">
            {t('filters.assignee')}
            <Select name="assignee" defaultValue={assigneeFilterValue(filters.assignee)}>
              <option value="">{t('filters.all')}</option>
              <option value="me">{t('filters.me')}</option>
              <option value="unassigned">{t('filters.unassigned')}</option>
              {candidates.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.label}
                </option>
              ))}
            </Select>
          </label>
          <button type="submit" className={buttonClasses('secondary')}>
            {t('filters.apply')}
          </button>
        </form>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title={filtered ? t('noMatchesTitle') : t('emptyTitle')}
          description={filtered ? t('noMatchesBody') : t('emptyBody')}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => {
            const state = { status: row.status as TaskStatus, assigneeId: row.assignee_id }
            const actor = {
              level: viewer.level,
              isAdmin: viewer.isAdmin,
              isMember: viewer.isMember,
              isCreator: row.created_by === viewer.id,
              isAssignee: row.assignee_id === viewer.id,
            }
            const can = {
              take: canTake(actor, state),
              assign: canAssignTask(actor, state),
              complete: canComplete(actor, state),
              reopen: canReopen(actor, state),
              moves: nextStatuses(actor, state).filter(
                (next): next is 'open' | 'in_progress' =>
                  next !== 'done' && state.status !== 'done',
              ),
            }
            const hasControls =
              can.take || can.assign || can.complete || can.reopen || can.moves.length > 0
            const person = row.assignee_id ? profiles.get(row.assignee_id) : undefined
            const activityTitle = activityTitles.get(row.activity_id)
            return (
              <li key={row.id}>
                <Card className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-lg font-bold">{row.title}</h3>
                    <Badge tone={row.status === 'done' ? 'success' : 'neutral'}>
                      {ts(row.status as TaskStatus)}
                    </Badge>
                  </div>
                  <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                    <span>
                      {row.assignee_id
                        ? t('assignedTo', { name: person?.displayName ?? t('formerMember') })
                        : t('unassignedLabel')}
                    </span>
                    {row.due_on && <span>{t('due', { date: day(row.due_on) })}</span>}
                    {activityTitle && (
                      <Link
                        href={`/groups/${slug}/activities/${row.activity_id}`}
                        className="underline"
                      >
                        {t('inActivity', { title: activityTitle })}
                      </Link>
                    )}
                  </p>
                  {row.description && (
                    <p className="max-w-prose whitespace-pre-line break-words">{row.description}</p>
                  )}
                  {row.status === 'done' && (row.completion_note || row.completion_url) && (
                    <div className="flex flex-col gap-1">
                      {row.completion_note && (
                        <p className="max-w-prose whitespace-pre-line break-words">
                          {t('completionNote', { note: row.completion_note })}
                        </p>
                      )}
                      {row.completion_url && (
                        <a
                          href={row.completion_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline"
                        >
                          {t('completionLink')}
                        </a>
                      )}
                    </div>
                  )}
                  {hasControls && (
                    <TaskControls
                      target={{ groupId, slug, taskId: row.id }}
                      status={state.status}
                      assigneeId={row.assignee_id}
                      candidates={candidates}
                      can={can}
                    />
                  )}
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      {mayCreate && activityId && (
        <section aria-labelledby="create-task" className="flex flex-col gap-3">
          <h3 id="create-task" className="text-lg font-bold">
            {t('create.heading')}
          </h3>
          <Card>
            <CreateTaskForm
              groupId={groupId}
              slug={slug}
              activityId={activityId}
              candidates={candidates}
            />
          </Card>
        </section>
      )}
    </div>
  )
}
