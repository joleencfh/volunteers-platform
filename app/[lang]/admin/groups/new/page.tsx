import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { requireAdmin } from '@/lib/authz'
import { getTranslations } from '@/lib/i18n/server'
import { NewGroupForm } from './NewGroupForm'

export default function NewGroupPage() {
  return (
    <Suspense fallback={null}>
      <NewGroupContent />
    </Suspense>
  )
}

async function NewGroupContent() {
  // The session is read with a timestamp, so wait for the request instead of prerendering.
  await connection()
  await requireAdmin()
  const t = await getTranslations('admin.groups')
  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/groups" className="underline underline-offset-4">
        {t('backToList')}
      </Link>
      <h1 className="text-4xl font-bold">{t('newTitle')}</h1>
      <p className="max-w-prose text-muted">{t('newIntro')}</p>
      <NewGroupForm />
    </div>
  )
}
