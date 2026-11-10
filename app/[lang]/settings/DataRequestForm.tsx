'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/Button'
import { FormField, Select } from '@/components/ui/fields'
import { DATA_REQUEST_KINDS } from '@/lib/domain/data-requests'
import { useTranslations } from '@/lib/i18n/client'
import { requestData, type DataRequestState } from './actions'

const initial: DataRequestState = { status: 'idle' }

/** Asks an admin to export or delete the member's data. Shows only that it was recorded. */
export function DataRequestForm() {
  const t = useTranslations('settings.dataRequest')
  const [state, action, pending] = useActionState(requestData, initial)

  const message =
    state.status === 'recorded'
      ? t('recorded')
      : state.status === 'idle'
        ? null
        : t(`errors.${state.status}`)

  return (
    <form action={action} className="flex max-w-sm flex-col gap-4">
      <FormField id="data-request-kind" label={t('kindLabel')}>
        {(control) => (
          <Select {...control} name="kind" defaultValue="export">
            {DATA_REQUEST_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t(`kinds.${kind}`)}
              </option>
            ))}
          </Select>
        )}
      </FormField>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? t('sending') : t('submit')}
      </Button>
      <p
        role={state.status === 'recorded' || state.status === 'idle' ? 'status' : 'alert'}
        className="text-sm empty:hidden"
      >
        {message}
      </p>
    </form>
  )
}
