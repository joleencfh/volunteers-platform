import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { AppShell } from '@/components/shell/AppShell'
import { ToastProvider } from '@/components/ui/Toast'
import { LOCALES } from '@/lib/domain/locale'
import { I18nProvider } from '@/lib/i18n/client'
import { getMessages } from '@/lib/i18n/messages'
import { getLocale, getTranslations } from '@/lib/i18n/server'
import '../globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

// Cache Components needs a value for the root param at build time; proxy.ts picks the locale per request.
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }))
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app')
  return { title: t('name'), description: t('description') }
}

export default async function RootLayout({ children }: LayoutProps<'/[lang]'>) {
  const locale = await getLocale()
  const common = await getTranslations('common')
  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <I18nProvider locale={locale} messages={getMessages(locale)}>
          <ToastProvider dismissLabel={common('dismiss')}>
            <AppShell>{children}</AppShell>
          </ToastProvider>
        </I18nProvider>
      </body>
    </html>
  )
}
