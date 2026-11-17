'use client'

import { useActionState, useId } from 'react'
import {
  addMeeting,
  updateMeeting,
  type MeetingState,
} from '@/app/[lang]/groups/[slug]/meetings-actions'
import { Button } from '@/components/ui/Button'
import { FormField, Input } from '@/components/ui/fields'
import { useTranslations } from '@/lib/i18n/client'

const initial: MeetingState = { status: 'idle' }

export type MeetingDraft = {
  id: string
  /** `YYYY-MM-DDTHH:mm` on the app time zone's wall clock. */
  startsAt: string
  meetingUrl: string
  agendaUrl: string | null
}

/** Adds a meeting, or, given `meeting`, changes it. Only rendered for people who may edit content. */
export function MeetingForm({ groupId, meeting }: { groupId: string; meeting?: MeetingDraft }) {
  const t = useTranslations('groups.meetings')
  const [state, action, working] = useActionState(meeting ? updateMeeting : addMeeting, initial)
  const id = useId()

  const failed = state.status !== 'idle' && state.status !== 'added' && state.status !== 'updated'
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="groupId" value={groupId} />
      {meeting && <input type="hidden" name="meetingId" value={meeting.id} />}
      <FormField id={`${id}-starts`} label={t('startsAt')} required>
        {(props) => (
          <Input
            {...props}
            type="datetime-local"
            name="startsAt"
            required
            defaultValue={meeting?.startsAt}
          />
        )}
      </FormField>
      <FormField id={`${id}-meeting`} label={t('meetingUrl')} hint={t('urlHint')} required>
        {(props) => (
          <Input
            {...props}
            type="url"
            name="meetingUrl"
            required
            maxLength={500}
            pattern="https://\S+"
            defaultValue={meeting?.meetingUrl}
          />
        )}
      </FormField>
      <FormField id={`${id}-agenda`} label={t('agendaUrl')} hint={t('urlHint')}>
        {(props) => (
          <Input
            {...props}
            type="url"
            name="agendaUrl"
            maxLength={500}
            pattern="https://\S+"
            defaultValue={meeting?.agendaUrl ?? ''}
          />
        )}
      </FormField>
      <div>
        <Button type="submit" disabled={working}>
          {working ? t('working') : meeting ? t('save') : t('add')}
        </Button>
      </div>
      <p
        role={failed ? 'alert' : 'status'}
        className={`text-base font-semibold empty:hidden ${failed ? 'text-danger' : ''}`}
      >
        {state.status === 'idle' ? null : t(state.status)}
      </p>
    </form>
  )
}
