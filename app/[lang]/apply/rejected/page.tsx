import Link from 'next/link'
import { buttonClasses } from '@/components/ui/Button'
import { getTranslations } from '@/lib/i18n/server'

// Static and Italian whatever the URL locale. Nothing here depends on who is looking: a rejected
// person has no member record and cannot sign in, so they reach this page by link, not by session.
export default async function ApplyRejectedPage() {
  const t = await getTranslations('applyRejected', 'it')
  return (
    <div className="flex flex-col gap-4" lang="it">
      <h1 className="text-4xl font-bold">{t('title')}</h1>
      <p className="max-w-prose">{t('body')}</p>
      <p className="max-w-prose">{t('reapply')}</p>
      <Link href="/apply" className={buttonClasses('primary') + ' self-start'}>
        {t('apply')}
      </Link>
    </div>
  )
}
