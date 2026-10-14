import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { getTranslations } from '@/lib/i18n/server'
import { HeaderNav, type NavItem } from './HeaderNav'

/** Header, main area and footer around every page. New sections add entries to NAV_ITEMS. */
export async function AppShell({ children }: { children: ReactNode }) {
  const t = await getTranslations('shell')
  const items: NavItem[] = [{ href: '/', label: t('home') }]

  return (
    <>
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-brand px-4 py-3 font-semibold text-ink focus:not-sr-only focus:absolute focus:left-2 focus:top-2"
      >
        {t('skipToContent')}
      </a>
      <header className="relative border-b-2 border-ink bg-paper">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3 md:justify-start">
          <Link href="/" className="inline-flex min-h-11 items-center">
            <Image
              src="/pauseai-logo.png"
              alt={t('logoAlt')}
              width={1037}
              height={278}
              className="h-9 w-auto"
              priority
            />
          </Link>
          <HeaderNav items={items} menuLabel={t('menu')} navLabel={t('mainNavigation')} />
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-8"
      >
        {children}
      </main>
      <footer className="border-t-2 border-ink bg-brand text-ink">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-4">
          <p className="font-semibold">{t('footerName')}</p>
          <Link
            href="/privacy"
            className="inline-flex min-h-11 items-center font-semibold underline"
          >
            {t('privacy')}
          </Link>
        </div>
      </footer>
    </>
  )
}
