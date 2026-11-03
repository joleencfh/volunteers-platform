'use client'

import { IntlProvider, useFormatter, useLocale, useTranslations } from 'use-intl'
import type { ReactNode } from 'react'
import type { Locale } from '@/lib/domain/locale'
import type { Messages } from './messages'
import { TIME_ZONE } from './config'

/** Makes translations available to client components below it. Rendered once, in the root layout. */
export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale
  messages: Messages
  children: ReactNode
}) {
  return (
    <IntlProvider locale={locale} messages={messages} timeZone={TIME_ZONE}>
      {children}
    </IntlProvider>
  )
}

export { useFormatter, useLocale, useTranslations }
