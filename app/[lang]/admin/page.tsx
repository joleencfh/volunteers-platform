// The admin home: links to the admin tools. It also proves that the admin route is closed to
// everyone who is not an active admin.
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { Card } from '@/components/ui/display'
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
  const tools = [
    { href: '/admin/applications', title: t('applicationsLink'), text: t('applicationsBlurb') },
    { href: '/admin/onboarding', title: t('onboarding.title'), text: t('onboardingBlurb') },
  ]
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-4xl font-bold">{t('title')}</h1>
      <ul className="grid gap-4 sm:grid-cols-2">
        {tools.map((tool) => (
          <li key={tool.href}>
            <Card className="flex h-full flex-col gap-2">
              <h2 className="text-xl font-bold">
                <Link href={tool.href} className="underline underline-offset-4">
                  {tool.title}
                </Link>
              </h2>
              <p className="text-muted">{tool.text}</p>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}
