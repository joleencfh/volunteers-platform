import { connection } from 'next/server'
import { Suspense } from 'react'
import { Badge, Card, EmptyState } from '@/components/ui/display'
import { requireAdmin } from '@/lib/authz'
import { getFormatter, getTranslations } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'
import { ReviewActions } from './ReviewActions'

const RECENT_LIMIT = 20

export default function ApplicationsPage() {
  return (
    <Suspense fallback={null}>
      <ApplicationsContent />
    </Suspense>
  )
}

async function ApplicationsContent() {
  // The session is read with a timestamp, so wait for the request instead of prerendering.
  await connection()
  await requireAdmin()
  const t = await getTranslations('admin.applications')
  const format = await getFormatter()

  // The RLS client: only an admin's policies let these rows through.
  const supabase = await createClient()
  const [pending, recent] = await Promise.all([
    supabase
      .from('applications')
      .select(
        'id, display_name, real_name, email, city, motivation, heard_via, heard_other, ai_safety_knowledge, created_at',
      )
      .eq('status', 'pending')
      .order('created_at', { ascending: true }),
    supabase
      .from('applications')
      .select('id, display_name, status, decided_at')
      .neq('status', 'pending')
      .order('decided_at', { ascending: false })
      .limit(RECENT_LIMIT),
  ])
  const pendingRows = pending.data ?? []
  const recentRows = recent.data ?? []

  const date = (value: string) => format.dateTime(new Date(value), { dateStyle: 'medium' })

  return (
    <div className="flex flex-col gap-10">
      <h1 className="text-4xl font-bold">{t('title')}</h1>

      <section aria-labelledby="pending-heading" className="flex flex-col gap-4">
        <h2 id="pending-heading" className="text-2xl font-bold">
          {t('pendingHeading')}
        </h2>
        {pendingRows.length === 0 ? (
          <EmptyState title={t('pendingEmpty')} />
        ) : (
          <ul className="flex flex-col gap-4">
            {pendingRows.map((row) => (
              <li key={row.id}>
                <Card className="flex flex-col gap-5">
                  <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[auto_1fr]">
                    <Detail label={t('displayName')}>{row.display_name}</Detail>
                    <Detail label={t('realName')}>{row.real_name}</Detail>
                    <Detail label={t('email')}>{row.email}</Detail>
                    <Detail label={t('city')}>{row.city}</Detail>
                    <Detail label={t('heardVia')}>
                      {t(`heardOptions.${row.heard_via}`, { text: row.heard_other ?? '' })}
                    </Detail>
                    <Detail label={t('knowledge')}>{row.ai_safety_knowledge ?? t('none')}</Detail>
                    <Detail label={t('motivation')}>{row.motivation || t('none')}</Detail>
                    <Detail label={t('submittedAt')}>{date(row.created_at)}</Detail>
                  </dl>
                  <ReviewActions applicationId={row.id} />
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="recent-heading" className="flex flex-col gap-4">
        <h2 id="recent-heading" className="text-2xl font-bold">
          {t('recentHeading')}
        </h2>
        {recentRows.length === 0 ? (
          <EmptyState title={t('recentEmpty')} />
        ) : (
          <ul className="flex flex-col gap-2">
            {recentRows.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line py-2"
              >
                <span className="font-semibold">{row.display_name}</span>
                <Badge tone={row.status === 'approved' ? 'success' : 'danger'}>
                  {t(`status.${row.status === 'approved' ? 'approved' : 'rejected'}`)}
                </Badge>
                {row.decided_at && (
                  <span className="text-muted">
                    {t('decidedAt')}: {date(row.decided_at)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="font-semibold">{label}</dt>
      <dd className="whitespace-pre-line break-words">{children}</dd>
    </>
  )
}
