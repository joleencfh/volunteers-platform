import en from '@/messages/en.json'
import it from '@/messages/it.json'
import type { Locale } from '@/lib/domain/locale'

export type Messages = typeof en

type Tree = { [key: string]: string | Tree }

/** Overlay `override` on `base`, key by key, so a key missing from `override` keeps its base value. */
export function mergeMessages<T extends Tree>(base: T, override: Tree): T {
  const result: Tree = { ...base }
  for (const [key, value] of Object.entries(override)) {
    const current = result[key]
    result[key] =
      typeof value === 'object' && typeof current === 'object'
        ? mergeMessages(current, value)
        : value
  }
  return result as T
}

const catalogues: Record<Locale, Tree> = { en, it }

/** Messages for a locale with English filling any key that locale does not translate yet. */
export function getMessages(locale: Locale): Messages {
  return locale === 'en' ? en : mergeMessages(en, catalogues[locale])
}
