'use client'

import { useActionState, useId } from 'react'
import { Button } from '@/components/ui/Button'
import { FormField, Input, Textarea } from '@/components/ui/fields'
import {
  GROUP_DESCRIPTION_MAX_LENGTH,
  GROUP_NAME_MAX_LENGTH,
  GROUP_SLUG_MAX_LENGTH,
} from '@/lib/domain/groups'
import { useTranslations } from '@/lib/i18n/client'
import { createGroup, type GroupAdminState } from '../actions'

const initial: GroupAdminState = { status: 'idle' }

/** Creates a group; on success the action sends the admin to the new group's edit page. */
export function NewGroupForm() {
  const t = useTranslations('admin.groups')
  const [state, action, working] = useActionState(createGroup, initial)
  const id = useId()

  return (
    <form action={action} className="flex max-w-prose flex-col gap-4">
      <FormField id={`${id}-name`} label={t('name')} required>
        {(props) => <Input {...props} name="name" required maxLength={GROUP_NAME_MAX_LENGTH} />}
      </FormField>
      <FormField id={`${id}-slug`} label={t('slug')} hint={t('slugHint')} required>
        {(props) => (
          <Input
            {...props}
            name="slug"
            required
            maxLength={GROUP_SLUG_MAX_LENGTH}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            autoCapitalize="none"
            spellCheck={false}
          />
        )}
      </FormField>
      <FormField id={`${id}-description`} label={t('description')} required>
        {(props) => (
          <Textarea
            {...props}
            name="description"
            required
            rows={4}
            maxLength={GROUP_DESCRIPTION_MAX_LENGTH}
          />
        )}
      </FormField>
      <div>
        <Button type="submit" disabled={working}>
          {working ? t('creating') : t('create')}
        </Button>
      </div>
      <p role="alert" className="text-base font-semibold text-danger empty:hidden">
        {state.status === 'idle' || state.status === 'done' ? null : t(`errors.${state.status}`)}
      </p>
    </form>
  )
}
