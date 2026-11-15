'use client'

import { useActionState } from 'react'
import { deleteMeeting, type MeetingState } from '@/app/[lang]/groups/[slug]/meetings-actions'
import { Button } from '@/components/ui/Button'
import { useTranslations } from '@/lib/i18n/client'

const initial: MeetingState = { status: 'idle' }

export function DeleteMeetingForm({ groupId, meetingId }: { groupId: string; meetingId: string }) {
  const t = useTranslations('groups.meetings')
  const [state, action, working] = useActionState(deleteMeeting, initial)

  const failed = state.status !== 'idle' && state.status !== 'deleted'
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="meetingId" value={meetingId} />
      <div>
        <Button type="submit" variant="secondary" disabled={working}>
          {working ? t('working') : t('delete')}
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
