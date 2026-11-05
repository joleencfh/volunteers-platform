// Placeholder admin area: A-04 builds the application review here. For now it proves that the
// admin route is closed to everyone who is not an active admin.
import { connection } from 'next/server'
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
  // The session is read from Supabase with a timestamp (Date.now), so this must wait for the
  // request instead of being prerendered, including by Next.js's runtime prefetch.
  await connection()
  await requireAdmin()
  const t = await getTranslations('admin')
  return <h1 className="text-4xl font-bold">{t('title')}</h1>
}
