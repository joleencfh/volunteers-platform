'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import {
  CurrentActivitiesList,
  type CurrentActivity,
} from '@/components/onboarding/CurrentActivitiesList'
import { useTranslations } from '@/lib/i18n/client'
import type { StepWindowKind } from '@/lib/domain/onboarding'
import { completeOnboardingStep, type CompleteStepState } from './actions'

const initial: CompleteStepState = { status: 'idle' }
const LATER_KEY = 'onboarding-window-later'

// sessionStorage can be unavailable (private mode, blocked site data): the page works without it.
function laterChosen(stepKey: string): boolean {
  try {
    return window.sessionStorage.getItem(`${LATER_KEY}:${stepKey}`) === '1'
  } catch {
    return false
  }
}
function rememberLater(stepKey: string) {
  try {
    window.sessionStorage.setItem(`${LATER_KEY}:${stepKey}`, '1')
  } catch {
    // Nothing to do: the window may open again on the next page load.
  }
}

/**
 * The read-and-confirm window of one self-confirmed step (spec section 8, steps 3 and 4) and
 * the "Open" button on its checklist row. "I've read it" completes the step; "Later" and
 * "Close" only close the window, and "Later" also stops it opening by itself in this session.
 */
export function StepWindow({
  stepKey,
  stepTitle,
  kind,
  done,
  autoOpen,
  welcomeUrl,
  activities,
}: {
  stepKey: string
  stepTitle: string
  kind: StepWindowKind
  done: boolean
  autoOpen: boolean
  welcomeUrl: string | null
  activities: readonly CurrentActivity[]
}) {
  const t = useTranslations('onboarding')
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState(completeOnboardingStep, initial)
  const statusRef = useRef<HTMLParagraphElement>(null)
  const autoOpened = useRef(false)

  // First-login prompt: once per page load, unless the member chose "Later" in this session.
  useEffect(() => {
    if (!autoOpen || done || autoOpened.current) return
    autoOpened.current = true
    // sessionStorage only exists in the browser, so the choice cannot be read while rendering
    // without a hydration mismatch; this runs once per page load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!laterChosen(stepKey)) setOpen(true)
  }, [autoOpen, done, stepKey])

  const completed = state.status === 'done'
  // Move focus to the confirmation: the Open button the dialog would return to is gone by then.
  useEffect(() => {
    if (completed) statusRef.current?.focus()
  }, [completed])

  const canConfirm = kind === 'activities' || welcomeUrl !== null
  const failed = state.status !== 'idle' && state.status !== 'done'

  const footer = (
    <>
      {canConfirm && (
        <form action={action}>
          <input type="hidden" name="step" value={stepKey} />
          <Button type="submit" disabled={pending}>
            {pending ? t('markingDone') : t('window.confirm')}
          </Button>
        </form>
      )}
      {canConfirm && (
        <Button
          variant="secondary"
          onClick={() => {
            rememberLater(stepKey)
            setOpen(false)
          }}
        >
          {t('window.later')}
        </Button>
      )}
      <Button variant="secondary" onClick={() => setOpen(false)}>
        {t('window.close')}
      </Button>
    </>
  )

  return (
    <div className="flex flex-col gap-1">
      {!done && (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          {t('window.open')}
          <span className="sr-only"> {stepTitle}</span>
        </Button>
      )}
      <p role="status" tabIndex={-1} ref={statusRef} className="text-sm">
        {completed ? t('markedDone') : null}
      </p>
      <Modal
        open={open && !completed}
        onClose={() => setOpen(false)}
        title={stepTitle}
        closeLabel={t('window.closeWindow')}
        footer={footer}
      >
        {kind === 'welcome' ? (
          welcomeUrl ? (
            <p>
              <a
                href={welcomeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline"
              >
                {t('window.welcomeLink')}
                <span className="sr-only"> {t('window.newTab')}</span>
              </a>
            </p>
          ) : (
            <p>{t('window.welcomeUnavailable')}</p>
          )
        ) : (
          <CurrentActivitiesList activities={activities} />
        )}
        {failed && (
          <p role="alert" className="mt-3 font-semibold">
            {t('markDoneFailed')}
          </p>
        )}
      </Modal>
    </div>
  )
}
