// Placeholder: the pending screen is A-03.
import { getTranslations } from '@/lib/i18n/server'

export default async function ApplyPendingPage() {
  const t = await getTranslations('applyPending')
  return <h1 className="text-4xl font-bold">{t('title')}</h1>
}
