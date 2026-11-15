'use client'

import { useActionState, useId } from 'react'
import { updateGroupLinks, type LinksState } from '@/app/[lang]/groups/[slug]/meetings-actions'
import { Button } from '@/components/ui/Button'
import { FormField, Input } from '@/components/ui/fields'
import { useTranslations } from '@/lib/i18n/client'

const initial: LinksState = { status: 'idle' }

/** Sets or clears the Signal and docs links. Only rendered for people who may edit content. */
export function GroupLinksForm({
  groupId,
  signalUrl,
  docsUrl,
}: {
  groupId: string
  signalUrl: string | null
  docsUrl: string | null
}) {
  const t = useTranslations('groups.overview.linksForm')
  const [state, action, working] = useActionState(updateGroupLinks, initial)
  const id = useId()

  const failed = state.status !== 'idle' && state.status !== 'saved'
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="groupId" value={groupId} />
      <FormField id={`${id}-signal`} label={t('signalUrl')} hint={t('hint')}>
        {(props) => (
          <Input
            {...props}
            type="url"
            name="signalUrl"
            maxLength={500}
            pattern="https://\S+"
            defaultValue={signalUrl ?? ''}
          />
        )}
      </FormField>
      <FormField id={`${id}-docs`} label={t('docsUrl')}>
        {(props) => (
          <Input
            {...props}
            type="url"
            name="docsUrl"
            maxLength={500}
            pattern="https://\S+"
            defaultValue={docsUrl ?? ''}
          />
        )}
      </FormField>
      <div>
        <Button type="submit" disabled={working}>
          {working ? t('working') : t('save')}
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
