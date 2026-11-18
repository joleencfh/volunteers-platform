'use client'

import { useActionState } from 'react'
import {
  createActivity,
  type CreateActivityState,
} from '@/app/[lang]/groups/[slug]/activities/actions'
import { Button } from '@/components/ui/Button'
import type { FieldDefinition } from '@/lib/domain/activity-types'
import { useTranslations } from '@/lib/i18n/client'
import { ActivityFormFields } from './ActivityFormFields'

const initial: CreateActivityState = { status: 'idle' }

/** The create form of one activity type: common fields, then the type's own fields. */
export function ActivityForm({
  groupId,
  slug,
  type,
  fields,
}: {
  groupId: string
  slug: string
  type: string
  fields: readonly FieldDefinition[]
}) {
  const t = useTranslations('activities.form')
  const [state, action, working] = useActionState(createActivity, initial)

  const failed = state.status !== 'idle'
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="type" value={type} />
      <ActivityFormFields fields={fields} />

      <div>
        <Button type="submit" disabled={working}>
          {working ? t('working') : t('submit')}
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
