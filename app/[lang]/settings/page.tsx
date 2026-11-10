import { connection } from 'next/server'
import { Suspense } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/display'
import { requireUser } from '@/lib/authz'
import { sortRequests } from '@/lib/domain/data-requests'
import { getFormatter, getLocale, getTranslations } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'
import { DataRequestForm } from './DataRequestForm'
import { LanguageForm } from './LanguageForm'
import { signOut } from './actions'

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsContent />
    </Suspense>
  )
}

async function SettingsContent() {
  // The session is read with a timestamp, so wait for the request instead of prerendering.
  await connection()
  const member = await requireUser()
  const t = await getTranslations('settings')
  const locale = await getLocale()
  const format = await getFormatter()

  // The stored preference is the source of truth; the page itself renders in the rewritten locale.
  const supabase = await createClient()
  const { data } = await supabase.from('users').select('locale').eq('id', member.id).maybeSingle()
  const stored = data?.locale === 'it' ? 'it' : data?.locale === 'en' ? 'en' : locale

  // Own requests only: the database hides everyone else's from this session.
  const { data: requests } = await supabase
    .from('data_requests')
    .select('id, kind, status, created_at')
    .order('created_at', { ascending: false })
  const own = sortRequests(requests ?? [])

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-4xl font-bold">{t('title')}</h1>

      <section aria-labelledby="language-heading" className="flex flex-col gap-3">
        <h2 id="language-heading" className="text-2xl font-bold">
          {t('languageHeading')}
        </h2>
        <Card className="flex flex-col gap-4">
          <p className="max-w-prose">{t('languageIntro')}</p>
          <p>{t('currentLanguage', { language: t(`languages.${stored}`) })}</p>
          <LanguageForm current={stored} />
          <p className="max-w-prose text-muted">{t('legalNote')}</p>
        </Card>
      </section>

      <section aria-labelledby="data-heading" className="flex flex-col gap-3">
        <h2 id="data-heading" className="text-2xl font-bold">
          {t('dataRequest.heading')}
        </h2>
        <Card className="flex flex-col gap-4">
          <p className="max-w-prose">{t('dataRequest.intro')}</p>
          <p className="max-w-prose text-muted">{t('dataRequest.deletionNote')}</p>
          <DataRequestForm />
          {own.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-lg font-bold">{t('dataRequest.yourRequests')}</h3>
              <ul className="flex flex-col gap-1">
                {own.map((row) => (
                  <li key={row.id}>
                    {t(`dataRequest.kinds.${row.kind}`)} · {t(`dataRequest.status.${row.status}`)} ·{' '}
                    {format.dateTime(new Date(row.created_at), { dateStyle: 'medium' })}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </section>

      <section aria-labelledby="account-heading" className="flex flex-col gap-3">
        <h2 id="account-heading" className="text-2xl font-bold">
          {t('accountHeading')}
        </h2>
        <Card className="flex flex-col gap-4">
          <p className="max-w-prose">{t('signOutIntro')}</p>
          <form action={signOut}>
            <Button type="submit" variant="secondary">
              {t('signOut')}
            </Button>
          </form>
        </Card>
      </section>
    </div>
  )
}
