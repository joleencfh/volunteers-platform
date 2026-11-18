import { ActivitiesSection } from '@/components/activities/ActivitiesSection'
import { GroupLinksForm } from '@/components/groups/GroupLinksForm'
import { LeadSection } from '@/components/groups/LeadSection'
import { MeetingsSection, NextMeetings } from '@/components/groups/MeetingsSection'
import { LevelBadge } from '@/components/profile/LevelBadge'
import { GroupTasks, type TaskViewer } from '@/components/tasks/GroupTasks'
import { Card, EmptyState } from '@/components/ui/display'
import type { ActivityFilters } from '@/lib/domain/activity-input'
import type { GroupTab, GroupView } from '@/lib/domain/groups'
import type { TaskFilters } from '@/lib/domain/tasks'
import { getFormatter, getTranslations } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'

/** The body of one section of a group page. Only rendered for members and admins. */
export async function GroupSection({
  tab,
  group,
  canAssignLead,
  canEditContent,
  canCreate,
  filters,
  taskFilters,
  viewer,
}: {
  tab: GroupTab
  group: GroupView
  canAssignLead: boolean
  canEditContent: boolean
  canCreate: boolean
  filters: ActivityFilters
  taskFilters: TaskFilters
  viewer: Omit<TaskViewer, 'isMember'>
}) {
  switch (tab) {
    case 'overview':
      return (
        <Overview group={group} canAssignLead={canAssignLead} canEditContent={canEditContent} />
      )
    case 'members':
      return <Members groupId={group.id} />
    case 'meetings':
      return <MeetingsSection groupId={group.id} canEdit={canEditContent} />
    case 'activities':
      return (
        <ActivitiesSection
          groupId={group.id}
          slug={group.slug}
          filters={filters}
          canCreate={canCreate}
        />
      )
    case 'tasks':
      return (
        <GroupTasks
          groupId={group.id}
          slug={group.slug}
          viewer={{ ...viewer, isMember: group.isMember }}
          filters={taskFilters}
        />
      )
  }
}

async function Overview({
  group,
  canAssignLead,
  canEditContent,
}: {
  group: GroupView
  canAssignLead: boolean
  canEditContent: boolean
}) {
  const t = await getTranslations('groups')
  const links = [
    { label: t('overview.signal'), href: group.signalUrl },
    { label: t('overview.docs'), href: group.docsUrl },
  ].flatMap(({ label, href }) => (href ? [{ label, href }] : []))

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-2">
        <h2 className="text-xl font-bold">{t('overview.description')}</h2>
        <p className="max-w-prose whitespace-pre-line break-words">{group.description}</p>
      </Card>
      <Card className="flex flex-col gap-2">
        <h2 className="text-xl font-bold">{t('overview.links')}</h2>
        {links.length === 0 ? (
          <p>{t('overview.noLinks')}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {links.map(({ label, href }) => (
              <li key={label}>
                <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        )}
        {canEditContent && (
          <div className="flex flex-col gap-2 pt-2">
            <h3 className="text-lg font-bold">{t('overview.linksForm.title')}</h3>
            <GroupLinksForm
              groupId={group.id}
              signalUrl={group.signalUrl}
              docsUrl={group.docsUrl}
            />
          </div>
        )}
      </Card>
      <NextMeetings groupId={group.id} slug={group.slug} />
      <LeadSection groupId={group.id} canAssign={canAssignLead} currentLead={group.lead} />
    </div>
  )
}

async function Members({ groupId }: { groupId: string }) {
  const t = await getTranslations('groups')
  const format = await getFormatter()

  // Row-level security shows the member list to members of the group and admins only, and this
  // component is only rendered for them.
  const supabase = await createClient()
  const { data: memberships } = await supabase
    .from('wg_members')
    .select('user_id, joined_at')
    .eq('group_id', groupId)
    .order('joined_at')
  // The members view has no declared relationship to wg_members, so it cannot be embedded in one
  // query: read the names and levels with a second one and join them here.
  const ids = (memberships ?? []).map((row) => row.user_id)
  const { data: profiles } = ids.length
    ? await supabase.from('members').select('id, display_name, level').in('id', ids)
    : { data: [] }
  const byId = new Map((profiles ?? []).map((person) => [person.id, person]))
  const people = (memberships ?? []).flatMap((row) => {
    const person = byId.get(row.user_id)
    return person
      ? [
          {
            id: row.user_id,
            joinedAt: row.joined_at,
            name: person.display_name,
            level: person.level,
          },
        ]
      : []
  })

  if (people.length === 0) {
    return <EmptyState title={t('members.emptyTitle')} description={t('members.emptyBody')} />
  }

  return (
    <section aria-labelledby="group-members" className="flex flex-col gap-3">
      <h2 id="group-members" className="text-xl font-bold">
        {t('members.title')}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {people.map((person) => (
          <li key={person.id}>
            <Card className="flex flex-wrap items-center gap-3">
              <span className="font-semibold">{person.name}</span>
              <LevelBadge level={person.level} />
              <span className="text-sm text-muted">
                {t('members.joined', {
                  date: format.dateTime(new Date(person.joinedAt), { dateStyle: 'medium' }),
                })}
              </span>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  )
}
