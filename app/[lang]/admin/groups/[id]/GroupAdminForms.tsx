'use client'

import { useActionState, useId, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { FormField, Input, Select, Textarea } from '@/components/ui/fields'
import { GROUP_DESCRIPTION_MAX_LENGTH, GROUP_NAME_MAX_LENGTH } from '@/lib/domain/groups'
import { useTranslations } from '@/lib/i18n/client'
import {
  addGroupMember,
  archiveGroup,
  removeGroupMember,
  restoreGroup,
  updateGroup,
  type GroupAdminState,
} from '../actions'

const initial: GroupAdminState = { status: 'idle' }

/** A polite status for a finished change and an alert for a refused one. */
function Outcome({ state, done }: { state: GroupAdminState; done: string }) {
  const t = useTranslations('admin.groups')
  const failed = state.status !== 'idle' && state.status !== 'done'
  return (
    <p
      role={failed ? 'alert' : 'status'}
      className={`text-base font-semibold empty:hidden ${failed ? 'text-danger' : ''}`}
    >
      {state.status === 'idle'
        ? null
        : state.status === 'done'
          ? done
          : t(`errors.${state.status}`)}
    </p>
  )
}

export function EditGroupForm({
  groupId,
  name,
  description,
  signalUrl,
  docsUrl,
}: {
  groupId: string
  name: string
  description: string
  signalUrl: string | null
  docsUrl: string | null
}) {
  const t = useTranslations('admin.groups')
  const [state, action, working] = useActionState(updateGroup, initial)
  const id = useId()
  return (
    <form action={action} className="flex max-w-prose flex-col gap-4">
      <input type="hidden" name="groupId" value={groupId} />
      <FormField id={`${id}-name`} label={t('name')} required>
        {(props) => (
          <Input
            {...props}
            name="name"
            required
            maxLength={GROUP_NAME_MAX_LENGTH}
            defaultValue={name}
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
            defaultValue={description}
          />
        )}
      </FormField>
      <FormField id={`${id}-signal`} label={t('signalUrl')} hint={t('linkHint')}>
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
      <FormField id={`${id}-docs`} label={t('docsUrl')} hint={t('linkHint')}>
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
          {working ? t('saving') : t('save')}
        </Button>
      </div>
      <Outcome state={state} done={state.changed === false ? t('unchanged') : t('saved')} />
    </form>
  )
}

/** Archives an active group or restores an archived one. */
export function ArchiveControl({ groupId, archived }: { groupId: string; archived: boolean }) {
  const t = useTranslations('admin.groups')
  const [state, action, working] = useActionState(archived ? restoreGroup : archiveGroup, initial)
  const done = archived
    ? state.changed === false
      ? t('restoredAlready')
      : t('restoredDone')
    : state.changed === false
      ? t('archivedAlready')
      : t('archivedDone')
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="groupId" value={groupId} />
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
      <Outcome state={state} done={done} />
    </form>
  )
}

export function AddMemberForm({
  groupId,
  people,
}: {
  groupId: string
  people: { id: string; label: string }[]
}) {
  const t = useTranslations('admin.groups')
  const [state, action, working] = useActionState(addGroupMember, initial)
  const id = useId()
  if (people.length === 0) return <p className="text-muted">{t('noPeople')}</p>
  return (
    <form action={action} className="flex max-w-prose flex-col gap-3">
      <input type="hidden" name="groupId" value={groupId} />
      <FormField id={`${id}-person`} label={t('choosePerson')} required>
        {(props) => (
          <Select {...props} name="userId" required defaultValue="">
            <option value="" disabled>
              {t('choosePlaceholder')}
            </option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.label}
              </option>
            ))}
          </Select>
        )}
      </FormField>
      <div>
        <Button type="submit" disabled={working}>
          {working ? t('adding') : t('add')}
        </Button>
      </div>
      <Outcome state={state} done={state.changed === false ? t('alreadyMember') : t('added')} />
    </form>
  )
}

/** Two steps: the first click asks for confirmation, the second removes the member. */
export function RemoveMemberControl({
  groupId,
  userId,
  name,
}: {
  groupId: string
  userId: string
  name: string
}) {
  const t = useTranslations('admin.groups')
  const [confirming, setConfirming] = useState(false)
  const [state, action, working] = useActionState(removeGroupMember, initial)
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="userId" value={userId} />
      {confirming ? (
        <>
          <p className="text-sm text-muted">{t('removeHint')}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="danger" disabled={working}>
              {working ? t('removing') : t('confirmRemove', { name })}
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              {t('cancel')}
            </Button>
          </div>
        </>
      ) : (
        <Button variant="secondary" onClick={() => setConfirming(true)} className="self-start">
          {t('remove', { name })}
        </Button>
      )}
      <Outcome state={state} done={state.changed === false ? t('alreadyRemoved') : t('removed')} />
    </form>
  )
}
