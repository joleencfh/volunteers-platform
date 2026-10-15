// Placeholder: the rejected screen is A-03.
import { getTranslations } from '@/lib/i18n/server'

export default async function ApplyRejectedPage() {
  const t = await getTranslations('applyRejected')
  return <h1 className="text-4xl font-bold">{t('title')}</h1>
}
