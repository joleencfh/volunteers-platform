import { Suspense } from 'react'
import { fillNotice, NOTICE_VERSION } from '@/lib/domain/notice'
import { getLocale, getTranslations } from '@/lib/i18n/server'
import { getRetentionMonths } from '@/lib/notice-retention'
import notice from '@/messages/privacy-notice.it.json'

type Section = { heading: string; paragraphs?: string[]; items?: string[] }

// The notice is Italian whatever the locale in the URL (spec section 9). Its long text lives in
// messages/privacy-notice.it.json, outside the locale catalogues, because there is no English
// version yet: the English locale gets a short stub above the Italian text.
export default async function PrivacyPage() {
  const locale = await getLocale()
  const t = await getTranslations('privacy', 'it')
  const tEn = await getTranslations('privacy', 'en')
  return (
    <article className="flex flex-col gap-6" lang="it">
      <h1 className="text-4xl font-bold">{t('title')}</h1>
      {locale === 'en' && (
        <p lang="en" className="max-w-prose">
          {tEn('stub')}
        </p>
      )}
      <p
        role="note"
        className="max-w-prose rounded-md border-2 border-current p-3 font-semibold"
        data-testid="privacy-draft-marker"
      >
        {notice.draft}
      </p>
      <p className="max-w-prose">{notice.intro}</p>
      <Suspense fallback={<Sections months={null} />}>
        <SectionsWithConfig />
      </Suspense>
      <p className="text-sm">{t('version', { version: NOTICE_VERSION })}</p>
    </article>
  )
}

async function SectionsWithConfig() {
  const months = await getRetentionMonths()
  return <Sections months={months} />
}

function Sections({
  months,
}: {
  months: { rejectedApplications: number; leavers: number } | null
}) {
  const values = {
    rejectedMonths: months?.rejectedApplications ?? '…',
    leaverMonths: months?.leavers ?? '…',
  }
  return (
    <>
      {(notice.sections as Section[]).map((section) => (
        <section key={section.heading} className="flex max-w-prose flex-col gap-3">
          <h2 className="text-2xl font-bold">{section.heading}</h2>
          {section.items && (
            <ul className="list-disc pl-6">
              {section.items.map((item) => (
                <li key={item}>{fillNotice(item, values)}</li>
              ))}
            </ul>
          )}
          {section.paragraphs?.map((paragraph) => (
            <p key={paragraph}>{fillNotice(paragraph, values)}</p>
          ))}
        </section>
      ))}
    </>
  )
}
