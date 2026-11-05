'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { Button, buttonClasses } from '@/components/ui/Button'
import { FormField, Input } from '@/components/ui/fields'
import { useTranslations } from '@/lib/i18n/client'
import { createClient } from '@/lib/supabase/client'
import { requestMagicLink, type MagicLinkState } from './actions'

const initial: MagicLinkState = { status: 'idle' }

export function LoginView() {
  const t = useTranslations('login')
  const [state, formAction, pending] = useActionState(requestMagicLink, initial)
  const [googleFailed, setGoogleFailed] = useState(false)

  async function continueWithGoogle() {
    setGoogleFailed(false)
    // Supabase only redirects to origins on its own allowlist (supabase/config.toml, dashboard).
    const { error } = await createClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) setGoogleFailed(true)
  }

  const error =
    state.status === 'invalid'
      ? t('invalidEmail')
      : state.status === 'limited'
        ? t('tooManyRequests')
        : state.status === 'unavailable'
          ? t('unavailable')
          : undefined

  return (
    <div className="flex max-w-md flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <FormField id="email" label={t('emailLabel')} error={error}>
          {(control) => (
            <Input {...control} name="email" type="email" autoComplete="email" required />
          )}
        </FormField>
        <Button type="submit" disabled={pending}>
          {pending ? t('sending') : t('sendLink')}
        </Button>
        <p role="status" className="text-base font-semibold">
          {state.status === 'sent' ? t('linkSent') : null}
        </p>
      </form>

      <p className="text-center text-muted">{t('or')}</p>

      <div className="flex flex-col gap-2">
        <Button variant="secondary" onClick={continueWithGoogle}>
          {t('google')}
        </Button>
        <p role="alert" className="text-sm font-semibold text-danger">
          {googleFailed ? t('googleFailed') : null}
        </p>
      </div>

      <p className="flex flex-wrap items-center gap-x-2">
        {t('notAMember')}
        <Link href="/apply" className={buttonClasses('ghost')}>
          {t('apply')}
        </Link>
      </p>
    </div>
  )
}
