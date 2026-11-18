'use client'

import { useActionState, useId, useState } from 'react'
import {
  archiveActivity,
  joinActivity,
  leaveActivity,
  restoreActivity,
  setActivityLead,
  updateActivity,
  type ActivityActionState,
} from '@/app/[lang]/groups/[slug]/activities/actions'
import { Button } from '@/components/ui/Button'
import { FormField, Select } from '@/components/ui/fields'
import type { ParticipantRole } from '@/lib/domain/activities'
import type { FieldDefinition } from '@/lib/domain/activity-types'
import { useTranslations } from '@/lib/i18n/client'
import { ActivityFormFields, type ActivityDefaults } from './ActivityFormFields'

const initial: ActivityActionState = { status: 'idle' }

type Target = { groupId: string; slug: string; activityId: string }

function Hidden({ groupId, slug, activityId }: Target) {
  return (
    <>
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="activityId" value={activityId} />
    </>
  )
}

/** The result line of a control: a refusal as an alert, a success as a status. */
function Outcome({ state, done }: { state: ActivityActionState; done: string }) {
  const t = useTranslations('activities.manage.states')
  const failed = state.status !== 'idle' && state.status !== 'done'
  return (
    <p
      role={failed ? 'alert' : 'status'}
      className={`text-base font-semibold empty:hidden ${failed ? 'text-danger' : ''}`}
    >
      {state.status === 'idle' ? null : state.status === 'done' ? done : t(state.status)}
    </p>
  )
}

/** The edit form: the same fields as the create form, filled in. The type itself never changes. */
export function ActivityEditForm({
  target,
  fields,
  defaults,
}: {
  target: Target
  fields: readonly FieldDefinition[]
  defaults: ActivityDefaults
}) {
  const t = useTranslations('activities.manage')
  const [state, action, working] = useActionState(updateActivity, initial)
  return (
    <form action={action} className="flex flex-col gap-4">
      <Hidden {...target} />
      <ActivityFormFields fields={fields} defaults={defaults} />
      <div>
        <Button type="submit" disabled={working}>
          {working ? t('saving') : t('save')}
        </Button>
      </div>
      <Outcome state={state} done={t('saved')} />
    </form>
  )
}

/** Archive or restore. The page re-renders with the new `archived` value, so the message follows the action that ran. */
export function ArchiveControl({ target, archived }: { target: Target; archived: boolean }) {
  const t = useTranslations('activities.manage')
  const [restored, setRestored] = useState(archived)
  const [state, action, working] = useActionState(
    async (previous: ActivityActionState, formData: FormData) => {
      setRestored(archived)
      return archived ? restoreActivity(previous, formData) : archiveActivity(previous, formData)
    },
    initial,
  )
  return (
    <form action={action} className="flex flex-col gap-3">
      <Hidden {...target} />
      {!archived && <p className="max-w-prose text-muted">{t('archiveHint')}</p>}
      <div>
        <Button type="submit" variant={archived ? 'primary' : 'secondary'} disabled={working}>
          {archived
            ? working
              ? t('restoring')
              : t('restore')
            : working
              ? t('archiving')
              : t('archive')}
        </Button>
      </div>
      <Outcome state={state} done={restored ? t('restored') : t('archivedDone')} />
    </form>
  )
}

/**
 * Join as one of the allowed roles, or leave. A new volunteer is offered only "observer" (the choice
 * is not shown); the database refuses a participant role for them anyway.
 */
export function ParticipationControl({
  target,
  roles,
  role,
}: {
  target: Target
  roles: readonly ParticipantRole[]
  /** The caller's current role, or null when they do not take part. */
  role: ParticipantRole | null
}) {
  const t = useTranslations('activities.manage')
  const tr = useTranslations('activities.detail.roles')
  const [joinState, join, joining] = useActionState(joinActivity, initial)
  const [leaveState, leave, leaving] = useActionState(leaveActivity, initial)
  const id = useId()
  const state = leaveState.status !== 'idle' ? leaveState : joinState

  return (
    <div className="flex flex-col gap-3">
      {role === null ? (
        <form action={join} className="flex flex-wrap items-end gap-3">
          <Hidden {...target} />
          {roles.length > 1 ? (
            <FormField id={`${id}-role`} label={t('role')}>
              {(props) => (
                <Select {...props} name="role" defaultValue="participant">
                  {roles.map((option) => (
                    <option key={option} value={option}>
                      {tr(option)}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
          ) : (
            <>
              <input type="hidden" name="role" value={roles[0]} />
              <p className="max-w-prose text-muted">{t('observerOnly')}</p>
            </>
          )}
          <Button type="submit" disabled={joining}>
            {joining ? t('joining') : t('join')}
          </Button>
        </form>
      ) : (
        <form action={leave} className="flex flex-wrap items-center gap-3">
          <Hidden {...target} />
          <p>{t('youAre', { role: tr(role) })}</p>
          <Button type="submit" variant="secondary" disabled={leaving}>
            {leaving ? t('leaving') : t('leave')}
          </Button>
        </form>
      )}
      <Outcome state={state} done="" />
    </div>
  )
}

/** Picks the lead among the participants (observers are not offered), or clears it. */
export function LeadControl({
  target,
  candidates,
  leadId,
}: {
  target: Target
  candidates: { id: string; label: string }[]
  leadId: string | null
}) {
  const t = useTranslations('activities.manage')
  const [state, action, working] = useActionState(setActivityLead, initial)
  const id = useId()
  return (
    <form action={action} className="flex flex-col gap-3">
      <Hidden {...target} />
      <div className="flex flex-wrap items-end gap-3">
        <FormField id={`${id}-lead`} label={t('lead')}>
          {(props) => (
            <Select {...props} name="userId" defaultValue={leadId ?? ''}>
              <option value="">{t('noLead')}</option>
              {candidates.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.label}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <Button type="submit" disabled={working}>
          {working ? t('saving') : t('setLead')}
        </Button>
      </div>
      <Outcome state={state} done={t('leadSaved')} />
    </form>
  )
}
