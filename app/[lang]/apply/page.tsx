// Placeholder: the application form is A-03.
import { getTranslations } from '@/lib/i18n/server'

export default async function ApplyPage() {
  const t = await getTranslations('apply')
  return <h1 className="text-4xl font-bold">{t('title')}</h1>
}
