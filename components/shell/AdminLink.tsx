import Link from 'next/link'
import { connection } from 'next/server'
import { buttonClasses } from '@/components/ui/Button'
import { findMember } from '@/lib/authz/member'
import { getTranslations } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Header link to the admin home, with the number of applications waiting. Rendered only for an active
 * admin; for everyone else it renders nothing. Reads the session, so it sits behind <Suspense>.
 */
export async function AdminLink() {
  await connection()
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return null
  const member = await findMember(supabase, data.user)
  if (!member?.isAdmin) return null

  const { count } = await supabase
    .from('applications')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  const pending = count ?? 0
  const t = await getTranslations('admin')

  return (
    // No aria-label: the accessible name must contain the visible text (WCAG 2.5.3), and the
    // visible text includes the number, so the name is "Admin 2".
    <Link href="/admin" className={`${buttonClasses('ghost')} gap-2`}>
      {t('navLink')}
      {pending > 0 && (
        <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-brand px-1.5 text-sm font-bold text-ink">
          {pending}
        </span>
      )}
    </Link>
  )
}
