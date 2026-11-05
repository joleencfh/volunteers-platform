import { I18nProvider } from '@/lib/i18n/client'
import { getMessages } from '@/lib/i18n/messages'
import { getTranslations } from '@/lib/i18n/server'
import { ApplyView } from './ApplyView'

// The application flow is Italian from v1 whatever the locale in the URL (spec section 4), so it
// asks for Italian explicitly and gives its client form an Italian provider.
export default async function ApplyPage() {
  const t = await getTranslations('apply', 'it')
  return (
    <div className="flex flex-col gap-6" lang="it">
      <h1 className="text-4xl font-bold">{t('title')}</h1>
      <p className="max-w-prose">{t('intro')}</p>
      <I18nProvider locale="it" messages={getMessages('it')}>
        <ApplyView />
      </I18nProvider>
    </div>
  )
}
