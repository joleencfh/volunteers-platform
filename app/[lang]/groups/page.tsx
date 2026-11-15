import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { Badge, Card, EmptyState } from '@/components/ui/display'
import { requireUser } from '@/lib/authz'
import { toGroupView } from '@/lib/domain/groups'
import { getTranslations } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'

export default function GroupsPage() {
  return (
    <Suspense fallback={null}>
      <GroupsContent />
    </Suspense>
  )
}

async function GroupsContent() {
  // The session is read with a timestamp, so wait for the request instead of prerendering.
  await connection()
  await requireUser()
  const t = await getTranslations('groups')

  // The function returns one limited row per non-archived group; admins also get archived ones,
  // which this list leaves out (the admin screens of W-06 show them).
  const supabase = await createClient()
  const { data } = await supabase.rpc('list_working_groups')
  const groups = (data ?? []).map(toGroupView).filter((group) => !group.archived)

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold">{t('title')}</h1>
        <p className="max-w-prose text-muted">{t('intro')}</p>
      </div>

      {groups.length === 0 ? (
        <EmptyState title={t('emptyTitle')} description={t('emptyBody')} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {groups.map((group) => (
            <li key={group.id}>
              <Card className="flex h-full flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-bold">
                    <Link href={`/groups/${group.slug}`} className="underline">
                      {group.name}
                    </Link>
                  </h2>
                  {group.isMember && <Badge tone="brand">{t('memberMarker')}</Badge>}
                </div>
                <p className="whitespace-pre-line break-words">{group.description}</p>
                <p className="mt-auto text-sm text-muted">
                  {group.lead ? `${t('lead')}: ${group.lead.displayName}` : t('noLead')}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
