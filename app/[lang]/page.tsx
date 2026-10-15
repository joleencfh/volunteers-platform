// Placeholder home page; the signed-in home arrives with the onboarding stories.
import { getTranslations } from '@/lib/i18n/server'

export default async function Home() {
  const t = await getTranslations('home')
  return <h1 className="text-4xl font-bold">{t('title')}</h1>
}
