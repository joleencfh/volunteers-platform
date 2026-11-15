'use client'

import { useActionState } from 'react'
import { decideJoinRequest, type DecisionState } from '@/app/[lang]/groups/[slug]/actions'
import { Button } from '@/components/ui/Button'
import { useTranslations } from '@/lib/i18n/client'

const initial: DecisionState = { status: 'idle' }

/** Approve and Reject buttons for one pending join request. Once decided, only the result stays. */
export function JoinRequestActions({ requestId, name }: { requestId: string; name: string }) {
  const t = useTranslations('groups.requests')
  const [state, action, working] = useActionState(decideJoinRequest, initial)

  if (state.status === 'approved' || state.status === 'rejected') {
    return (
      <p role="status" className="font-semibold">
        {t(state.status)}
      </p>
    )
  }

  const failure = state.status === 'idle' ? null : state.status
  const failed = failure !== null
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="requestId" value={requestId} />
      <div className="flex flex-wrap gap-2">
        {/* The accessible names name the person and still contain the visible words. */}
        <Button
          type="submit"
          name="approve"
          value="true"
          disabled={working}
          aria-label={working ? undefined : t('approveFor', { name })}
        >
          {working ? t('working') : t('approve')}
        </Button>
        <Button
          type="submit"
          name="approve"
          value="false"
          variant="secondary"
          disabled={working}
          aria-label={working ? undefined : t('rejectFor', { name })}
        >
          {working ? t('working') : t('reject')}
        </Button>
      </div>
      <p
        role={failed ? 'alert' : 'status'}
        className={`text-base font-semibold empty:hidden ${failed ? 'text-danger' : ''}`}
      >
        {failure ? t(failure) : null}
      </p>
    </form>
  )
}
