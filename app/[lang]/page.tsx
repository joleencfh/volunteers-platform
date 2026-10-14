// Placeholder home page; the app shell arrives in F-06.
import { getTranslations } from '@/lib/i18n/server'

export default async function Home() {
  const t = await getTranslations('home')
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
    </main>
  )
}
