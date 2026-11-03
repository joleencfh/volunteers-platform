// Placeholder: the privacy notice text is A-05.
import { getTranslations } from '@/lib/i18n/server'

export default async function PrivacyPage() {
  const t = await getTranslations('privacy')
  return <h1 className="text-4xl font-bold">{t('title')}</h1>
}
