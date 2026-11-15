'use client'

import { useActionState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { FormField, Select } from '@/components/ui/fields'
import { LOCALES, type Locale } from '@/lib/domain/locale'
import { useTranslations } from '@/lib/i18n/client'
import { setLocale, type LocaleState } from './actions'

const initial: LocaleState = { status: 'idle' }

/** Language choice. After a save the page reloads so the proxy sees the new cookie. */
export function LanguageForm({ current }: { current: Locale }) {
  const t = useTranslations('settings')
  const [state, action, pending] = useActionState(setLocale, initial)

  useEffect(() => {
    if (state.status === 'saved') window.location.reload()
  }, [state.status])

  const message =
    state.status === 'saved' ? t('saved') : state.status === 'idle' ? null : t('failed')

  return (
    <form action={action} className="flex max-w-sm flex-col gap-4">
      <FormField id="locale" label={t('languageLabel')}>
        {(control) => (
          <Select {...control} name="locale" defaultValue={current}>
            {LOCALES.map((locale) => (
              <option key={locale} value={locale}>
                {t(`languages.${locale}`)}
              </option>
            ))}
          </Select>
        )}
      </FormField>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? t('saving') : t('save')}
      </Button>
      <p role="status" className="text-sm">
        {message}
      </p>
    </form>
  )
}
