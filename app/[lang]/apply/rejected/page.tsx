// Placeholder: the rejected screen is A-03.
import { getTranslations } from '@/lib/i18n/server'

export default async function ApplyRejectedPage() {
  const t = await getTranslations('applyRejected')
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
    </main>
  )
}
