'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/Button'
import { useTranslations } from '@/lib/i18n/client'
import { completeOnboardingStep, type CompleteStepState } from './actions'

const initial: CompleteStepState = { status: 'idle' }

/**
 * "Mark as done" for one self-confirmed step. It stays mounted after the step is done so the
 * confirmation is announced; the button itself disappears.
 */
export function CompleteStepButton({
  stepKey,
  stepTitle,
  done,
}: {
  stepKey: string
  stepTitle: string
  done: boolean
}) {
  const t = useTranslations('onboarding')
  const [state, action, pending] = useActionState(completeOnboardingStep, initial)

  const message =
    state.status === 'done' ? t('markedDone') : state.status === 'idle' ? null : t('markDoneFailed')

  return (
    <div className="flex flex-col gap-1">
      {!done && (
        <form action={action}>
          <input type="hidden" name="step" value={stepKey} />
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? t('markingDone') : t('markDone')}
            <span className="sr-only"> {stepTitle}</span>
          </Button>
        </form>
      )}
      <p role="status" className="text-sm">
        {message}
      </p>
    </div>
  )
}
