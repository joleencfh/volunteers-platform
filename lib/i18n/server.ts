import { lang } from 'next/root-params'
import { notFound } from 'next/navigation'
import {
  createFormatter,
  createTranslator,
  type NamespaceKeys,
  type NestedKeyOf,
} from 'use-intl/core'
import { isLocale, type Locale } from '@/lib/domain/locale'
import { getMessages, type Messages } from './messages'
import { TIME_ZONE } from './config'

// `next/root-params` is not available in Server Actions or Route Handlers: pass `locale` there.
async function resolveLocale(locale?: Locale): Promise<Locale> {
  if (locale) return locale
  const fromRoute = await lang()
  if (!isLocale(fromRoute)) notFound()
  return fromRoute
}

/** Translator for server components. `namespace` narrows keys, e.g. `getTranslations('home')`. */
export async function getTranslations<
  Namespace extends NamespaceKeys<Messages, NestedKeyOf<Messages>> = never,
>(namespace?: Namespace, locale?: Locale) {
  const resolved = await resolveLocale(locale)
  return createTranslator<Messages, Namespace>({
    locale: resolved,
    messages: getMessages(resolved),
    namespace,
    timeZone: TIME_ZONE,
  })
}

/** Locale-aware date, number and list formatting for server components. */
export async function getFormatter(locale?: Locale) {
  return createFormatter({ locale: await resolveLocale(locale), timeZone: TIME_ZONE })
}

export async function getLocale(): Promise<Locale> {
  return resolveLocale()
}
