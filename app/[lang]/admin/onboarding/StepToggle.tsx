'use client'

import { useState, useTransition } from 'react'
import { Checkbox } from '@/components/ui/fields'
import { useTranslations } from '@/lib/i18n/client'
import { confirmAdminStep, unconfirmAdminStep } from './actions'

/**
 * One admin-confirmed step of one member. Ticking confirms, unticking takes it back. The row
 * stays on the page until it is reloaded, so a mistake can be undone right away.
 */
export function StepToggle({
  userId,
  stepKey,
  label,
  initialDone,
}: {
  userId: string
  stepKey: string
  label: string
  initialDone: boolean
}) {
  const t = useTranslations('admin.onboarding')
  const [done, setDone] = useState(initialDone)
  const [failed, setFailed] = useState(false)
  const [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition()

  function change(next: boolean) {
    startTransition(async () => {
      const result = await (next ? confirmAdminStep : unconfirmAdminStep)(userId, stepKey)
      if (result.status === 'done') {
        setDone(next)
        setFailed(false)
        setMessage(next ? t('confirmed', { step: label }) : t('unconfirmed', { step: label }))
      } else {
        setFailed(true)
        setMessage(t(`errors.${result.status}`))
      }
    })
  }

  return (
    <div>
      <Checkbox
        label={label}
        checked={done}
        disabled={pending}
        onChange={(event) => change(event.target.checked)}
      />
      <p
        role={failed ? 'alert' : 'status'}
        className={`text-sm empty:hidden ${failed ? 'text-danger' : 'text-muted'}`}
      >
        {message}
      </p>
    </div>
  )
}
