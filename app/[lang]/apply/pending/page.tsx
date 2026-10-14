// Placeholder: the pending screen is A-03.
import { getTranslations } from '@/lib/i18n/server'

export default async function ApplyPendingPage() {
  const t = await getTranslations('applyPending')
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
    </main>
  )
}
