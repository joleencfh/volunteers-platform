'use client'

import { useActionState } from 'react'
import { requestToJoin, type JoinState } from '@/app/[lang]/groups/[slug]/actions'
import { Button } from '@/components/ui/Button'
import { useTranslations } from '@/lib/i18n/client'

const initial: JoinState = { status: 'idle' }

/** The "Request to join" form of the limited view. Shows the result once the request is sent. */
export function JoinRequestButton({ groupId }: { groupId: string }) {
  const t = useTranslations('groups.join')
  const [state, action, working] = useActionState(requestToJoin, initial)

  if (state.status === 'requested') {
    return (
      <p role="status" className="font-semibold">
        {t('requested')}
      </p>
    )
  }

  const failure = state.status === 'idle' ? null : state.status
  const failed = failure !== null
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="groupId" value={groupId} />
      <Button type="submit" disabled={working} className="self-start">
        {working ? t('working') : t('request')}
      </Button>
      <p
        role={failed ? 'alert' : 'status'}
        className={`text-base font-semibold empty:hidden ${failed ? 'text-danger' : ''}`}
      >
        {failure ? t(failure) : null}
      </p>
    </form>
  )
}
