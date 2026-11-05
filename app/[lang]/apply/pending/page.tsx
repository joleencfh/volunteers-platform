import Link from 'next/link'
import { buttonClasses } from '@/components/ui/Button'
import { getTranslations } from '@/lib/i18n/server'

// Static and Italian whatever the URL locale. It says the same to everyone, so it reveals nothing
// about who has applied; someone without a member record cannot sign in, which it also says.
export default async function ApplyPendingPage() {
  const t = await getTranslations('applyPending', 'it')
  return (
    <div className="flex flex-col gap-4" lang="it">
      <h1 className="text-4xl font-bold">{t('title')}</h1>
      <p className="max-w-prose">{t('body')}</p>
      <p className="max-w-prose">{t('signIn')}</p>
      <Link href="/" className={buttonClasses('secondary') + ' self-start'}>
        {t('home')}
      </Link>
    </div>
  )
}
