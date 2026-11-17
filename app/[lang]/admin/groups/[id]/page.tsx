import Link from 'next/link'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { z } from 'zod'
import { Badge, EmptyState } from '@/components/ui/display'
import { requireAdmin } from '@/lib/authz'
import { getFormatter, getTranslations } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'
import {
  AddMemberForm,
  ArchiveControl,
  EditGroupForm,
  RemoveMemberControl,
} from './GroupAdminForms'

export default function EditGroupPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <EditGroupContent params={params} />
    </Suspense>
  )
}

async function EditGroupContent({ params }: { params: Promise<{ id: string }> }) {
  // The session is read with a timestamp, so wait for the request instead of prerendering.
  await connection()
  await requireAdmin()
  const parsedId = z.uuid().safeParse((await params).id)
  if (!parsedId.success) notFound()
  const groupId = parsedId.data

  const t = await getTranslations('admin.groups')
  const format = await getFormatter()

  // The RLS client: an admin's policies show every group, membership and person.
  const supabase = await createClient()
  const [{ data: group }, { data: memberships }, { data: people }] = await Promise.all([
    supabase
      .from('working_groups')
      .select('id, slug, name, description, signal_url, docs_url, archived_at')
      .eq('id', groupId)
      .maybeSingle(),
    supabase.from('wg_members').select('user_id, joined_at').eq('group_id', groupId),
    supabase
      .from('users')
      .select('id, display_name, real_name')
      .eq('status', 'active')
      .order('display_name', { ascending: true }),
  ])
  if (!group) notFound()

  const joined = new Map((memberships ?? []).map((row) => [row.user_id, row.joined_at]))
  const members = (people ?? []).filter((person) => joined.has(person.id))
  const candidates = (people ?? [])
    .filter((person) => !joined.has(person.id))
    .map((person) => ({ id: person.id, label: `${person.display_name} (${person.real_name})` }))
  const archived = group.archived_at !== null

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <Link href="/admin/groups" className="underline underline-offset-4">
          {t('backToList')}
        </Link>
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-4xl font-bold">{group.name}</h1>
          {archived && <Badge tone="neutral">{t('archived')}</Badge>}
        </div>
        <p className="text-muted">{t('slugLabel', { slug: group.slug })}</p>
      </div>

      <EditGroupForm
        key={`${group.name}|${group.description}|${group.signal_url}|${group.docs_url}`}
        groupId={group.id}
        name={group.name}
        description={group.description}
        signalUrl={group.signal_url}
        docsUrl={group.docs_url}
      />

      <section aria-labelledby="status-heading" className="flex flex-col gap-4">
        <h2 id="status-heading" className="text-2xl font-bold">
          {t('statusHeading')}
        </h2>
        <ArchiveControl groupId={group.id} archived={archived} />
      </section>

      <section aria-labelledby="members-heading" className="flex flex-col gap-4">
        <h2 id="members-heading" className="text-2xl font-bold">
          {t('membersHeading')}
        </h2>
        {members.length === 0 ? (
          <EmptyState title={t('membersEmpty')} />
        ) : (
          <ul className="flex flex-col gap-3">
            {members.map((person) => (
              <li
                key={person.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border-2 border-line p-4"
              >
                <div>
                  <p className="font-semibold">
                    {person.display_name} ({person.real_name})
                  </p>
                  <p className="text-sm text-muted">
                    {t('memberSince', {
                      date: format.dateTime(new Date(joined.get(person.id) as string), {
                        dateStyle: 'medium',
                      }),
                    })}
                  </p>
                </div>
                <RemoveMemberControl
                  groupId={group.id}
                  userId={person.id}
                  name={person.display_name}
                />
              </li>
            ))}
          </ul>
        )}
        <h3 className="text-xl font-bold">{t('addMember')}</h3>
        <AddMemberForm groupId={group.id} people={candidates} />
      </section>
    </div>
  )
}
