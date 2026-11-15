import { connection } from 'next/server'
import { getTranslations } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'
import { HeaderNav, type NavItem } from './HeaderNav'

/**
 * The header navigation. Signed-in members get Home (/home), their profile and settings; a visitor gets a
 * single link to the public landing page. Reads the session, so it sits behind <Suspense>.
 */
export async function MainNav() {
  await connection()
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  const t = await getTranslations('shell')
  // Join requests the caller may decide (admins: all; others: groups where they are fresh or above).
  const pending = data.user ? ((await supabase.rpc('pending_join_request_count')).data ?? 0) : 0
  const items: NavItem[] = data.user
    ? [
        { href: '/home', label: t('home') },
        { href: '/groups', label: t('groups'), badge: pending },
        { href: '/profile', label: t('profile') },
        { href: '/settings', label: t('settings') },
      ]
    : [{ href: '/', label: t('home') }]
  return <HeaderNav items={items} menuLabel={t('menu')} navLabel={t('mainNavigation')} />
}

/** What shows while the session is read: the visitor's navigation. */
export async function MainNavFallback() {
  const t = await getTranslations('shell')
  return (
    <HeaderNav
      items={[{ href: '/', label: t('home') }]}
      menuLabel={t('menu')}
      navLabel={t('mainNavigation')}
    />
  )
}
