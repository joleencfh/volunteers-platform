'use client'

import { useActionState, useId } from 'react'
import {
  savePostmortem,
  type PostmortemState,
} from '@/app/[lang]/groups/[slug]/activities/postmortem-actions'
import { Button } from '@/components/ui/Button'
import { FormField, Textarea } from '@/components/ui/fields'
import { POSTMORTEM_FIELD_MAX_LENGTH } from '@/lib/domain/activities'
import { useTranslations } from '@/lib/i18n/client'

const initial: PostmortemState = { status: 'idle' }

type Props = {
  target: { groupId: string; slug: string; activityId: string }
  defaults: { wentWell: string; improvements: string; learnings: string }
}

/** The postmortem form, for those who may edit it. The page re-renders with the saved texts. */
export function PostmortemForm({ target, defaults }: Props) {
  const t = useTranslations('activities.postmortem')
  const id = useId()
  const [state, action, working] = useActionState(savePostmortem, initial)
  const failed = state.status !== 'idle' && state.status !== 'done'
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="groupId" value={target.groupId} />
      <input type="hidden" name="slug" value={target.slug} />
      <input type="hidden" name="activityId" value={target.activityId} />
      {(
        [
          ['wentWell', defaults.wentWell],
          ['improvements', defaults.improvements],
          ['learnings', defaults.learnings],
        ] as const
      ).map(([name, value]) => (
        <FormField key={name} id={`${id}-${name}`} label={t(name)}>
          {(props) => (
            <Textarea
              {...props}
              name={name}
              rows={4}
              maxLength={POSTMORTEM_FIELD_MAX_LENGTH}
              defaultValue={value}
            />
          )}
        </FormField>
      ))}
      <div>
        <Button type="submit" disabled={working}>
          {working ? t('saving') : t('save')}
        </Button>
      </div>
      <p
        role={failed ? 'alert' : 'status'}
        className={`text-base font-semibold empty:hidden ${failed ? 'text-danger' : ''}`}
      >
        {state.status === 'idle'
          ? null
          : state.status === 'done'
            ? t('saved')
            : t(`states.${state.status}`)}
      </p>
    </form>
  )
}
