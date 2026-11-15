import Link from 'next/link'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { JoinRequestCard } from '@/components/groups/JoinRequestCard'
import { JoinRequestsSection } from '@/components/groups/JoinRequestsSection'
import { Badge } from '@/components/ui/display'
import { requireUser } from '@/lib/authz'
import { GROUP_TABS, isValidSlug, parseGroupTab, toGroupView } from '@/lib/domain/groups'
import { getTranslations } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'
import { GroupSection } from './GroupSection'

type Params = Promise<{ slug: string }>
type SearchParams = Promise<{ tab?: string | string[] }>

export default function GroupPage({
  params,
  searchParams,
}: {
  params: Params
  searchParams: SearchParams
}) {
  return (
    <Suspense fallback={null}>
      <GroupContent params={params} searchParams={searchParams} />
    </Suspense>
  )
}

async function GroupContent({
  params,
  searchParams,
}: {
  params: Params
  searchParams: SearchParams
}) {
  // The session is read with a timestamp, so wait for the request instead of prerendering.
  await connection()
  const member = await requireUser()
  const { slug } = await params
  if (!isValidSlug(slug)) notFound()
  const { tab: tabParam } = await searchParams
  const tab = parseGroupTab(tabParam)
  const t = await getTranslations('groups')

  // get_working_group returns no row for a missing or archived group (for non-admins), and the
  // links only to members and admins.
  const supabase = await createClient()
  const { data } = await supabase.rpc('get_working_group', { p_slug: slug })
  const row = data?.[0]
  if (!row) notFound()
  const group = toGroupView(row)
  const fullView = group.isMember || member.isAdmin
  // Whether this person may decide join requests: asked of the database, not worked out here.
  const { data: canApprove } = fullView
    ? await supabase.rpc('can_approve_join', { p_group: group.id })
    : { data: false }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-4xl font-bold">{group.name}</h1>
          {group.isMember && <Badge tone="brand">{t('memberMarker')}</Badge>}
        </div>
        <p className="max-w-prose whitespace-pre-line break-words">{group.description}</p>
        <p className="text-muted">
          {group.lead ? `${t('lead')}: ${group.lead.displayName}` : t('noLead')}
        </p>
      </div>

      {fullView ? (
        <>
          <nav aria-label={t('sectionsLabel', { name: group.name })}>
            <ul className="flex flex-wrap gap-2">
              {GROUP_TABS.map((key) => (
                <li key={key}>
                  <Link
                    href={`/groups/${group.slug}?tab=${key}`}
                    aria-current={key === tab ? 'page' : undefined}
                    className={`inline-flex min-h-11 items-center rounded-lg border-2 px-4 font-semibold ${
                      key === tab
                        ? 'border-ink bg-brand text-ink'
                        : 'border-line-strong bg-paper text-ink'
                    }`}
                  >
                    {t(`tabs.${key}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          {tab === 'overview' && (
            <JoinRequestsSection groupId={group.id} canApprove={canApprove === true} />
          )}
          <GroupSection tab={tab} group={group} />
        </>
      ) : (
        <JoinRequestCard groupId={group.id} userId={member.id} />
      )}
    </div>
  )
}
