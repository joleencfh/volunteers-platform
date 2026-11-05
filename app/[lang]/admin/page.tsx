// Placeholder admin area: A-04 builds the application review here. For now it proves that the
// admin route is closed to everyone who is not an active admin.
import { Suspense } from 'react'
import { requireAdmin } from '@/lib/authz'
import { getTranslations } from '@/lib/i18n/server'

export default function AdminPage() {
  return (
    <Suspense fallback={null}>
      <AdminContent />
    </Suspense>
  )
}

async function AdminContent() {
  await requireAdmin()
  const t = await getTranslations('admin')
  return <h1 className="text-4xl font-bold">{t('title')}</h1>
}
