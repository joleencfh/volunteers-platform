import { LevelBadge } from '@/components/profile/LevelBadge'
import { Card, EmptyState } from '@/components/ui/display'
import type { GroupTab, GroupView } from '@/lib/domain/groups'
import { getFormatter, getTranslations } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'

/** The body of one section of a group page. Only rendered for members and admins. */
export async function GroupSection({ tab, group }: { tab: GroupTab; group: GroupView }) {
  const t = await getTranslations('groups')

  switch (tab) {
    case 'overview':
      return <Overview group={group} />
    case 'members':
      return <Members groupId={group.id} />
    case 'activities':
    case 'tasks':
    case 'meetings':
      // Empty until T-01 (activities, tasks) and W-05 (meetings).
      return <EmptyState title={t(`${tab}.emptyTitle`)} description={t(`${tab}.emptyBody`)} />
  }
}

async function Overview({ group }: { group: GroupView }) {
  const t = await getTranslations('groups')
  const links = [
    { label: t('overview.signal'), href: group.signalUrl },
    { label: t('overview.docs'), href: group.docsUrl },
  ].flatMap(({ label, href }) => (href ? [{ label, href }] : []))

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-2">
        <h2 className="text-xl font-bold">{t('overview.description')}</h2>
        <p className="max-w-prose whitespace-pre-line break-words">{group.description}</p>
      </Card>
      <Card className="flex flex-col gap-2">
        <h2 className="text-xl font-bold">{t('overview.links')}</h2>
        {links.length === 0 ? (
          <p>{t('overview.noLinks')}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {links.map(({ label, href }) => (
              <li key={label}>
                <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

async function Members({ groupId }: { groupId: string }) {
  const t = await getTranslations('groups')
  const format = await getFormatter()

  // Row-level security shows the member list to members of the group and admins only, and this
  // component is only rendered for them.
  const supabase = await createClient()
  const { data } = await supabase
    .from('wg_members')
    .select('user_id, joined_at, members(display_name, level)')
    .eq('group_id', groupId)
    .order('joined_at')
  const people = (data ?? []).flatMap((row) => {
    // The members view has no declared key, so the client types the embed as one row or a list.
    const person = Array.isArray(row.members) ? row.members[0] : row.members
    return person
      ? [
          {
            id: row.user_id,
            joinedAt: row.joined_at,
            name: person.display_name,
            level: person.level,
          },
        ]
      : []
  })

  if (people.length === 0) {
    return <EmptyState title={t('members.emptyTitle')} description={t('members.emptyBody')} />
  }

  return (
    <section aria-labelledby="group-members" className="flex flex-col gap-3">
      <h2 id="group-members" className="text-xl font-bold">
        {t('members.title')}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {people.map((person) => (
          <li key={person.id}>
            <Card className="flex flex-wrap items-center gap-3">
              <span className="font-semibold">{person.name}</span>
              <LevelBadge level={person.level} />
              <span className="text-sm text-muted">
                {t('members.joined', {
                  date: format.dateTime(new Date(person.joinedAt), { dateStyle: 'medium' }),
                })}
              </span>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  )
}
