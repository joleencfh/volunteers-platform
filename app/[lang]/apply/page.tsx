// Placeholder: the application form is A-03.
import { getTranslations } from '@/lib/i18n/server'

export default async function ApplyPage() {
  const t = await getTranslations('apply')
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
    </main>
  )
}
