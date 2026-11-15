import { connection } from 'next/server'
import { Suspense } from 'react'
import { Badge, Card, EmptyState } from '@/components/ui/display'
import { requireAdmin } from '@/lib/authz'
import { sortRequests } from '@/lib/domain/data-requests'
import { getFormatter, getTranslations } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'
import { MarkHandled } from './MarkHandled'

export default function DataRequestsPage() {
  return (
    <Suspense fallback={null}>
      <DataRequestsContent />
    </Suspense>
  )
}

async function DataRequestsContent() {
  // The session is read with a timestamp, so wait for the request instead of prerendering.
  await connection()
  await requireAdmin()
  const t = await getTranslations('admin.dataRequests')
  const format = await getFormatter()

  // The RLS client: only an admin's policies let other people's requests and names through.
  const supabase = await createClient()
  const [{ data: requestRows }, { data: memberRows }] = await Promise.all([
    supabase.from('data_requests').select('id, user_id, kind, status, created_at, handled_at'),
    supabase.from('users').select('id, display_name, real_name'),
  ])
  const people = new Map((memberRows ?? []).map((member) => [member.id, member]))
  const rows = sortRequests(requestRows ?? [])
  const date = (value: string) => format.dateTime(new Date(value), { dateStyle: 'medium' })

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-4xl font-bold">{t('title')}</h1>
      <p className="max-w-prose text-muted">{t('intro')}</p>

      {rows.length === 0 ? (
        <EmptyState title={t('empty')} />
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((row) => {
            const person = people.get(row.user_id)
            return (
              <li key={row.id}>
                <Card className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <h2 className="text-xl font-bold">{person?.display_name}</h2>
                    <Badge tone={row.status === 'open' ? 'brand' : 'success'}>
                      {t(`status.${row.status}`)}
                    </Badge>
                    <span className="font-semibold">{t(`kinds.${row.kind}`)}</span>
                  </div>
                  <p className="text-muted">
                    {t('name')}: {person?.real_name} · {t('requestedOn')}: {date(row.created_at)}
                    {row.handled_at && ` · ${t('handledOn')}: ${date(row.handled_at)}`}
                  </p>
                  {row.status === 'open' && <MarkHandled requestId={row.id} />}
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
