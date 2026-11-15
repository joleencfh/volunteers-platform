'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/Button'
import { useTranslations } from '@/lib/i18n/client'
import { markRequestHandled, type HandleState } from './actions'

const initial: HandleState = { status: 'idle' }

/** Marks one open request as handled. */
export function MarkHandled({ requestId }: { requestId: string }) {
  const t = useTranslations('admin.dataRequests')
  const [state, action, pending] = useActionState(markRequestHandled, initial)

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="requestId" value={requestId} />
      <Button type="submit" variant="secondary" disabled={pending} className="self-start">
        {t('markHandled')}
      </Button>
      {state.status === 'idle' ? null : state.status === 'done' ? (
        <p role="status" className="text-sm">
          {t('handled')}
        </p>
      ) : (
        <p role="alert" className="text-sm">
          {t(`errors.${state.status}`)}
        </p>
      )}
    </form>
  )
}
