import { Suspense } from 'react'
import { getTranslations } from '@/lib/i18n/server'
import { LoginView } from './LoginView'

export default async function LoginPage({ searchParams }: PageProps<'/[lang]/login'>) {
  const t = await getTranslations('login')
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-4xl font-bold">{t('title')}</h1>
      <p className="max-w-prose">{t('intro')}</p>
      {/* searchParams is request data, so it sits behind Suspense; the form stays in the static shell. */}
      <Suspense fallback={null}>
        <RefusedNotice searchParams={searchParams} />
      </Suspense>
      <LoginView />
    </div>
  )
}

// One message for every refusal (not a member, rejected, deactivated, unverified, bad link).
async function RefusedNotice({ searchParams }: Pick<PageProps<'/[lang]/login'>, 'searchParams'>) {
  const { error } = await searchParams
  if (!error) return null
  const t = await getTranslations('login')
  return (
    <p role="alert" className="max-w-prose rounded-md border-2 border-danger p-4 font-semibold">
      {t('refused')}
    </p>
  )
}
