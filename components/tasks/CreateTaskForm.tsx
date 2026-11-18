'use client'

import { useActionState, useId } from 'react'
import { createTask, type TaskActionState } from '@/app/[lang]/groups/[slug]/tasks/actions'
import { Button } from '@/components/ui/Button'
import { FormField, Input, Select, Textarea } from '@/components/ui/fields'
import { TASK_DESCRIPTION_MAX_LENGTH, TASK_TITLE_MAX_LENGTH } from '@/lib/domain/activities'
import { useTranslations } from '@/lib/i18n/client'

const initial: TaskActionState = { status: 'idle' }

/** Creates a task in one activity, optionally assigned to a member of the group. */
export function CreateTaskForm({
  groupId,
  slug,
  activityId,
  candidates,
}: {
  groupId: string
  slug: string
  activityId: string
  candidates: { id: string; label: string }[]
}) {
  const t = useTranslations('tasks.create')
  const ts = useTranslations('tasks.controls.states')
  const [state, action, working] = useActionState(createTask, initial)
  const id = useId()
  const failed =
    state.status !== 'idle' && state.status !== 'done' && state.status !== 'doneEmailFailed'

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="activityId" value={activityId} />
      <FormField id={`${id}-title`} label={t('title')} required>
        {(props) => (
          <Input
            {...props}
            name="title"
            required
            maxLength={TASK_TITLE_MAX_LENGTH}
            autoComplete="off"
          />
        )}
      </FormField>
      <FormField id={`${id}-description`} label={t('description')}>
        {(props) => (
          <Textarea {...props} name="description" maxLength={TASK_DESCRIPTION_MAX_LENGTH} />
        )}
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id={`${id}-due`} label={t('dueOn')}>
          {(props) => <Input {...props} type="date" name="dueOn" />}
        </FormField>
        <FormField id={`${id}-assignee`} label={t('assignee')}>
          {(props) => (
            <Select {...props} name="assigneeId" defaultValue="">
              <option value="">{t('unassigned')}</option>
              {candidates.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.label}
                </option>
              ))}
            </Select>
          )}
        </FormField>
      </div>
      <div>
        <Button type="submit" disabled={working}>
          {working ? t('working') : t('submit')}
        </Button>
      </div>
      <p
        role={failed ? 'alert' : 'status'}
        className={
          failed ? 'text-base font-semibold text-danger empty:hidden' : 'text-base empty:hidden'
        }
      >
        {state.status !== 'idle' && state.status !== 'done' ? ts(state.status) : null}
      </p>
    </form>
  )
}
