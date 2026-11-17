import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { Badge, Card, EmptyState } from '@/components/ui/display'
import { buttonClasses } from '@/components/ui/Button'
import { requireAdmin } from '@/lib/authz'
import { getTranslations } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'

export default function AdminGroupsPage() {
  return (
    <Suspense fallback={null}>
      <AdminGroupsContent />
    </Suspense>
  )
}

async function AdminGroupsContent() {
  // The session is read with a timestamp, so wait for the request instead of prerendering.
  await connection()
  await requireAdmin()
  const t = await getTranslations('admin.groups')

  // The RLS client: an admin's policies show every group, archived ones too, and every membership.
  const supabase = await createClient()
  const [{ data: groups }, { data: memberships }] = await Promise.all([
    supabase
      .from('working_groups')
      .select('id, slug, name, archived_at')
      .order('name', { ascending: true }),
    supabase.from('wg_members').select('group_id'),
  ])
  const counts = new Map<string, number>()
  for (const { group_id } of memberships ?? [])
    counts.set(group_id, (counts.get(group_id) ?? 0) + 1)

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-4xl font-bold">{t('title')}</h1>
        <Link href="/admin/groups/new" className={buttonClasses('primary')}>
          {t('newGroup')}
        </Link>
      </div>
      <p className="max-w-prose text-muted">{t('intro')}</p>

      {!groups || groups.length === 0 ? (
        <EmptyState title={t('empty')} />
      ) : (
        <ul className="flex flex-col gap-4">
          {groups.map((group) => (
            <li key={group.id}>
              <Card className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <h2 className="text-xl font-bold">
                  <Link href={`/admin/groups/${group.id}`} className="underline underline-offset-4">
                    {group.name}
                  </Link>
                </h2>
                {group.archived_at && <Badge tone="neutral">{t('archived')}</Badge>}
                <span className="text-muted">{group.slug}</span>
                <span>{t('members', { count: counts.get(group.id) ?? 0 })}</span>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
