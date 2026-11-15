import Link from 'next/link'
import { Card, EmptyState } from '@/components/ui/display'
import {
  OVERVIEW_MEETINGS_SHOWN,
  PAST_MEETINGS_SHOWN,
  toLocalDateTime,
} from '@/lib/domain/meetings'
import { getFormatter, getTranslations } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'
import { DeleteMeetingForm } from './DeleteMeetingForm'
import { MeetingForm } from './MeetingForm'

type Meeting = {
  id: string
  starts_at: string
  meeting_url: string
  agenda_url: string | null
}

const COLUMNS = 'id, starts_at, meeting_url, agenda_url'

async function MeetingItem({
  meeting,
  groupId,
  canEdit,
}: {
  meeting: Meeting
  groupId: string
  canEdit: boolean
}) {
  const t = await getTranslations('groups.meetings')
  const format = await getFormatter()
  return (
    <Card className="flex flex-col gap-3">
      <p className="font-semibold">
        {format.dateTime(new Date(meeting.starts_at), { dateStyle: 'full', timeStyle: 'short' })}
      </p>
      <ul className="flex flex-wrap gap-x-6 gap-y-1">
        <li>
          <a
            href={meeting.meeting_url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            {t('meetingLink')}
          </a>
        </li>
        {meeting.agenda_url && (
          <li>
            <a
              href={meeting.agenda_url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              {t('agendaLink')}
            </a>
          </li>
        )}
      </ul>
      {canEdit && (
        <details className="flex flex-col gap-3">
          <summary className="min-h-11 cursor-pointer py-2 font-semibold underline">
            {t('edit')}
            <span className="sr-only">
              {' '}
              {format.dateTime(new Date(meeting.starts_at), { dateStyle: 'medium' })}
            </span>
          </summary>
          <div className="flex flex-col gap-4 pt-2">
            <h4 className="text-lg font-bold">{t('editTitle')}</h4>
            <MeetingForm
              groupId={groupId}
              meeting={{
                id: meeting.id,
                startsAt: toLocalDateTime(new Date(meeting.starts_at)),
                meetingUrl: meeting.meeting_url,
                agendaUrl: meeting.agenda_url,
              }}
            />
            <DeleteMeetingForm groupId={groupId} meetingId={meeting.id} />
          </div>
        </details>
      )}
    </Card>
  )
}

/**
 * The Meetings section: upcoming meetings (soonest first), the most recent past ones, and, for
 * people who may edit content (the database's can_edit_group_content, passed in), the add and edit
 * forms. Only rendered for members and admins; row-level security hides meetings from everyone else.
 */
export async function MeetingsSection({ groupId, canEdit }: { groupId: string; canEdit: boolean }) {
  const t = await getTranslations('groups.meetings')
  const now = new Date().toISOString()

  const supabase = await createClient()
  const [upcoming, past] = await Promise.all([
    supabase
      .from('wg_meetings')
      .select(COLUMNS)
      .eq('group_id', groupId)
      .gte('starts_at', now)
      .order('starts_at'),
    supabase
      .from('wg_meetings')
      .select(COLUMNS)
      .eq('group_id', groupId)
      .lt('starts_at', now)
      .order('starts_at', { ascending: false })
      .limit(PAST_MEETINGS_SHOWN),
  ])
  const upcomingRows = upcoming.data ?? []
  const pastRows = past.data ?? []

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="meetings-upcoming" className="flex flex-col gap-3">
        <h2 id="meetings-upcoming" className="text-xl font-bold">
          {t('upcomingTitle')}
        </h2>
        {upcomingRows.length === 0 ? (
          pastRows.length === 0 ? (
            <EmptyState title={t('emptyTitle')} description={t('emptyBody')} />
          ) : (
            <p>{t('noUpcoming')}</p>
          )
        ) : (
          <ul className="flex flex-col gap-3">
            {upcomingRows.map((meeting) => (
              <li key={meeting.id}>
                <MeetingItem meeting={meeting} groupId={groupId} canEdit={canEdit} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {pastRows.length > 0 && (
        <section aria-labelledby="meetings-past" className="flex flex-col gap-3">
          <h2 id="meetings-past" className="text-xl font-bold">
            {t('pastTitle')}
          </h2>
          <ul className="flex flex-col gap-3">
            {pastRows.map((meeting) => (
              <li key={meeting.id}>
                <MeetingItem meeting={meeting} groupId={groupId} canEdit={canEdit} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {canEdit && (
        <section aria-labelledby="meetings-add" className="flex flex-col gap-3">
          <h2 id="meetings-add" className="text-xl font-bold">
            {t('addTitle')}
          </h2>
          <Card>
            <MeetingForm groupId={groupId} />
          </Card>
        </section>
      )}
    </div>
  )
}

/** The next few upcoming meetings on the Overview, with a link to the whole list. */
export async function NextMeetings({ groupId, slug }: { groupId: string; slug: string }) {
  const t = await getTranslations('groups.meetings')
  const format = await getFormatter()

  const supabase = await createClient()
  const { data } = await supabase
    .from('wg_meetings')
    .select(COLUMNS)
    .eq('group_id', groupId)
    .gte('starts_at', new Date().toISOString())
    .order('starts_at')
    .limit(OVERVIEW_MEETINGS_SHOWN)
  const meetings = data ?? []

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-xl font-bold">{t('overviewTitle')}</h2>
      {meetings.length === 0 ? (
        <p>{t('noUpcoming')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {meetings.map((meeting) => (
            <li key={meeting.id} className="flex flex-wrap items-center gap-x-6 gap-y-1">
              <span className="font-semibold">
                {format.dateTime(new Date(meeting.starts_at), {
                  dateStyle: 'full',
                  timeStyle: 'short',
                })}
              </span>
              <a
                href={meeting.meeting_url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {t('meetingLink')}
              </a>
              {meeting.agenda_url && (
                <a
                  href={meeting.agenda_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  {t('agendaLink')}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
      <Link href={`/groups/${slug}?tab=meetings`} className="font-semibold underline">
        {t('seeAll')}
      </Link>
    </Card>
  )
}
