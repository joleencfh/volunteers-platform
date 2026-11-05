'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { FormField, Select, Textarea } from '@/components/ui/fields'
import { DEFAULT_START_LEVEL, REASON_MAX_LENGTH, USER_LEVELS } from '@/lib/domain/review'
import { useTranslations } from '@/lib/i18n/client'
import { approveApplication, rejectApplication, type ReviewState } from './actions'

const initial: ReviewState = { status: 'idle' }

/** Approve (with starting level) and reject forms for one pending application. */
export function ReviewActions({ applicationId }: { applicationId: string }) {
  const t = useTranslations('admin.applications')
  const [approveState, approve, approving] = useActionState(approveApplication, initial)
  const [rejectState, reject, rejecting] = useActionState(rejectApplication, initial)
  const [level, setLevel] = useState<string>(DEFAULT_START_LEVEL)
  const busy = approving || rejecting

  const messageOf = (state: ReviewState) => {
    if (state.status === 'idle' || state.status === 'invalid') return null
    if (state.status === 'done') {
      return state.emailSent === false ? t('results.doneEmailFailed') : t('results.done')
    }
    return t(`results.${state.status}`)
  }
  const message = messageOf(approveState) ?? messageOf(rejectState)
  const failed = [approveState, rejectState].some(
    (state) => state.status !== 'idle' && state.status !== 'done',
  )

  const reasonError = approveState.errors?.reason
  const levelError = approveState.errors?.level
  const applicationError = approveState.errors?.applicationId ?? rejectState.errors?.applicationId

  // Once decided, the buttons go and only the result stays (including a failed email, which the
  // admin has to follow up by hand). The list itself refreshes on the next visit.
  if (approveState.status === 'done' || rejectState.status === 'done') {
    return (
      <p role="status" className="text-base font-semibold">
        {message}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <form action={approve} className="flex flex-col gap-4" noValidate>
        <h3 className="text-lg font-bold">{t('approveHeading')}</h3>
        <input type="hidden" name="applicationId" value={applicationId} />
        <FormField
          id={`level-${applicationId}`}
          label={t('startLevel')}
          hint={t('startLevelHint')}
          error={levelError ? t(`errors.${levelError}`) : undefined}
        >
          {(control) => (
            <Select
              {...control}
              name="level"
              value={level}
              onChange={(event) => setLevel(event.target.value)}
            >
              {USER_LEVELS.map((option) => (
                <option key={option} value={option}>
                  {t(`levels.${option}`)}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        {level !== DEFAULT_START_LEVEL && (
          <FormField
            id={`reason-${applicationId}`}
            label={t('reason')}
            hint={t('reasonHint')}
            error={reasonError ? t(`errors.${reasonError}`) : undefined}
            required
          >
            {(control) => <Textarea {...control} name="reason" maxLength={REASON_MAX_LENGTH} />}
          </FormField>
        )}
        <Button type="submit" disabled={busy} className="self-start">
          {approving ? t('working') : t('approve')}
        </Button>
      </form>

      <form action={reject} className="flex flex-col gap-2">
        <input type="hidden" name="applicationId" value={applicationId} />
        <Button type="submit" variant="danger" disabled={busy} className="self-start">
          {rejecting ? t('working') : t('reject')}
        </Button>
      </form>

      {applicationError && (
        <p role="alert" className="text-base font-semibold text-danger">
          {t(`errors.${applicationError}`)}
        </p>
      )}
      <p
        role={failed ? 'alert' : 'status'}
        className={`text-base font-semibold empty:hidden ${failed ? 'text-danger' : ''}`}
      >
        {message}
      </p>
    </div>
  )
}
