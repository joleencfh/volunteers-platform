import type { Locale } from '@/lib/domain/locale'
import type { Messages } from './messages'

// Makes translation keys and locale names type-checked everywhere.
declare module 'use-intl' {
  interface AppConfig {
    Locale: Locale
    Messages: Messages
  }
}
