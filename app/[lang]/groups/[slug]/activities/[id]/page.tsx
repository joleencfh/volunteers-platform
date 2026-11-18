import Link from 'next/link'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { Suspense } from 'react'
import {
  ActivityEditForm,
  ArchiveControl,
  LeadControl,
  ParticipationControl,
} from '@/components/activities/ActivityControls'
import { ActivityDetails } from '@/components/activities/ActivityDetails'
import { LevelBadge } from '@/components/profile/LevelBadge'
import { Badge, Card } from '@/components/ui/display'
import { requireUser } from '@/lib/authz'
import {
  ACTIVITY_STATUSES,
  canArchiveActivity,
  canEditActivity,
  participantRoleFor,
  type ActivityStatus,
  type ParticipantRole,
} from '@/lib/domain/activities'
import { toDetailDefaults } from '@/lib/domain/activity-input'
import { getActivityType, parseDetailsLoosely } from '@/lib/domain/activity-types'
import { isValidSlug, toGroupView } from '@/lib/domain/groups'
import { readMemberProfiles } from '@/lib/groups/member-profiles'
import { getFormatter, getTranslations } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'

type Params = Promise<{ slug: string; id: string }>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function ActivityPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={null}>
      <ActivityContent params={params} />
    </Suspense>
  )
}

async function ActivityContent({ params }: { params: Params }) {
  await connection()
  const member = await requireUser()
  const { slug, id } = await params
  if (!isValidSlug(slug) || !UUID.test(id)) notFound()

  const supabase = await createClient()
  const { data } = await supabase.rpc('get_working_group', { p_slug: slug })
  const row = data?.[0]
  if (!row) notFound()
  const group = toGroupView(row)
  // Members and admins only: row-level security would return nothing to anyone else anyway.
  if (!group.isMember && !member.isAdmin) notFound()

  const { data: activity } = await supabase
    .from('activities')
    .select(
      'id, group_id, type, title, description, status, starts_on, due_on, lead_id, key_activity, links, details, is_general, archived_at, created_by',
    )
    .eq('id', id)
    .eq('group_id', group.id)
    .maybeSingle()
  if (!activity) notFound()

  // The members view cannot be embedded: read the participants, then the names, and join here.
  const { data: participantRows } = await supabase
    .from('activity_participants')
    .select('user_id, role, joined_at')
    .eq('activity_id', activity.id)
    .order('joined_at')
  const participants = participantRows ?? []
  const profiles = await readMemberProfiles(supabase, [
    ...participants.map((person) => person.user_id),
    ...(activity.lead_id ? [activity.lead_id] : []),
  ])

  const t = await getTranslations('activities')
  const tt = await getTranslations('activityTypes')
  const format = await getFormatter()
  const definition = getActivityType(activity.type)
  const status = (ACTIVITY_STATUSES as readonly string[]).includes(activity.status)
    ? (activity.status as ActivityStatus)
    : 'planned'
  const day = (value: string) =>
    format.dateTime(new Date(`${value}T12:00:00Z`), { dateStyle: 'medium' })
  const links = Array.isArray(activity.links)
    ? activity.links.flatMap((link) =>
        typeof link === 'object' &&
        link !== null &&
        !Array.isArray(link) &&
        typeof link.label === 'string' &&
        typeof link.url === 'string'
          ? [{ label: link.label, url: link.url }]
          : [],
      )
    : []
  const lead = activity.lead_id ? profiles.get(activity.lead_id) : undefined

  // Hiding is never the only protection: the actions and the database check the same rules again.
  const actor = {
    level: member.level,
    isAdmin: member.isAdmin,
    isMember: group.isMember,
    isCreator: activity.created_by === member.id,
    isLead: activity.lead_id === member.id,
  }
  const open = activity.archived_at === null
  const mayEdit = open && !activity.is_general && canEditActivity(actor)
  const mayArchive = !activity.is_general && canArchiveActivity(actor)
  const target = { groupId: group.id, slug: group.slug, activityId: activity.id }
  const mine = participants.find((person) => person.user_id === member.id)
  const leadCandidates = participants.flatMap((person) => {
    const profile = profiles.get(person.user_id)
    return person.role === 'participant' && profile
      ? [{ id: person.user_id, label: profile.displayName }]
      : []
  })
  const defaults =
    mayEdit && definition
      ? {
          title: activity.title,
          description: activity.description ?? '',
          status,
          startsOn: activity.starts_on ?? '',
          dueOn: activity.due_on ?? '',
          keyActivity: activity.key_activity,
          links,
          details: toDetailDefaults(
            definition.fields,
            parseDetailsLoosely(definition.key, activity.details),
          ),
        }
      : null

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <p>
        <Link href={`/groups/${group.slug}?tab=activities`} className="font-semibold underline">
          {t('backToList', { name: group.name })}
        </Link>
      </p>
      <div className="flex flex-col gap-3">
        <h1 className="text-4xl font-bold">{activity.title}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <Badge>{definition ? tt(definition.labelKey as never) : activity.type}</Badge>
          <Badge>{t(`status.${status}`)}</Badge>
          {activity.key_activity && <Badge tone="brand">{t('keyMarker')}</Badge>}
          {activity.archived_at && <Badge tone="danger">{t('archivedMarker')}</Badge>}
        </div>
        {activity.description && (
          <p className="max-w-prose whitespace-pre-line break-words">{activity.description}</p>
        )}
        <dl className="flex flex-wrap gap-x-8 gap-y-1">
          {activity.starts_on && (
            <div className="flex gap-2">
              <dt className="font-semibold">{t('form.startsOn')}:</dt>
              <dd>{day(activity.starts_on)}</dd>
            </div>
          )}
          {activity.due_on && (
            <div className="flex gap-2">
              <dt className="font-semibold">{t('form.dueOn')}:</dt>
              <dd>{day(activity.due_on)}</dd>
            </div>
          )}
          <div className="flex gap-2">
            <dt className="font-semibold">{t('detail.lead')}:</dt>
            <dd>{lead ? lead.displayName : t('detail.noLead')}</dd>
          </div>
        </dl>
      </div>

      {definition && definition.fields.length > 0 && (
        <ActivityDetails definition={definition} details={activity.details} />
      )}

      {links.length > 0 && (
        <section aria-labelledby="activity-links" className="flex flex-col gap-2">
          <h2 id="activity-links" className="text-xl font-bold">
            {t('detail.links')}
          </h2>
          <ul className="flex flex-col gap-1">
            {links.map((link) => (
              <li key={`${link.label}-${link.url}`}>
                <a href={link.url} target="_blank" rel="noopener noreferrer" className="underline">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="activity-participants" className="flex flex-col gap-3">
        <h2 id="activity-participants" className="text-xl font-bold">
          {t('detail.participants')}
        </h2>
        {participants.length === 0 ? (
          <p>{t('detail.noParticipants')}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {participants.map((person) => {
              const profile = profiles.get(person.user_id)
              if (!profile) return null
              return (
                <li key={person.user_id}>
                  <Card className="flex flex-wrap items-center gap-3">
                    <span className="font-semibold">{profile.displayName}</span>
                    <Badge>{t(`detail.roles.${person.role}`)}</Badge>
                    <LevelBadge level={profile.level} />
                  </Card>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {open && (
        <section aria-labelledby="activity-participation" className="flex flex-col gap-3">
          <h2 id="activity-participation" className="text-xl font-bold">
            {t('detail.participation')}
          </h2>
          <ParticipationControl
            target={target}
            roles={participantRoleFor(member.level, member.isAdmin)}
            role={(mine?.role as ParticipantRole | undefined) ?? null}
          />
        </section>
      )}

      {mayEdit && (
        <section aria-labelledby="activity-lead" className="flex flex-col gap-3">
          <h2 id="activity-lead" className="text-xl font-bold">
            {t('manage.leadTitle')}
          </h2>
          <LeadControl target={target} candidates={leadCandidates} leadId={activity.lead_id} />
        </section>
      )}

      {defaults && definition && (
        <section aria-labelledby="activity-edit" className="flex flex-col gap-3">
          <h2 id="activity-edit" className="text-xl font-bold">
            {t('manage.editTitle')}
          </h2>
          <Card>
            <ActivityEditForm target={target} fields={definition.fields} defaults={defaults} />
          </Card>
        </section>
      )}

      {mayArchive && (
        <section aria-labelledby="activity-archive" className="flex flex-col gap-3">
          <h2 id="activity-archive" className="text-xl font-bold">
            {t('manage.archiveTitle')}
          </h2>
          <ArchiveControl target={target} archived={!open} />
        </section>
      )}

      <section aria-labelledby="activity-tasks" className="flex flex-col gap-2">
        <h2 id="activity-tasks" className="text-xl font-bold">
          {t('detail.tasksTitle')}
        </h2>
        <p>{t('detail.tasksSoon')}</p>
      </section>
    </div>
  )
}
