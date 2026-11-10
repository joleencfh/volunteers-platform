import { notFound, redirect } from 'next/navigation'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { ActivityFeedPlaceholder } from '@/components/profile/ActivityFeedPlaceholder'
import { LevelBadge } from '@/components/profile/LevelBadge'
import { Card } from '@/components/ui/display'
import { requireUser } from '@/lib/authz'
import { KNOWLEDGE_LEVELS } from '@/lib/domain/application'
import { getFormatter, getTranslations } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'

export default function PersonPage({ params }: PageProps<'/[lang]/people/[id]'>) {
  return (
    <Suspense fallback={null}>
      <PersonContent params={params} />
    </Suspense>
  )
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function PersonContent({ params }: { params: Promise<{ id: string }> }) {
  // The session is read with a timestamp, so wait for the request instead of prerendering.
  await connection()
  const member = await requireUser()
  const { id } = await params
  if (!UUID.test(id)) notFound()
  if (id === member.id) redirect('/profile')

  const t = await getTranslations('profile')
  const format = await getFormatter()

  // get_profile returns nothing for someone who is not an active member and null for every field
  // the caller may not see, so this page only renders what came back.
  const supabase = await createClient()
  const { data } = await supabase.rpc('get_profile', { owner: id })
  const person = data?.[0]
  if (!person) notFound()

  const knowledge = KNOWLEDGE_LEVELS.find((level) => level === person.ai_safety_knowledge)
  const details: { label: string; value: string }[] = [
    { label: t('city'), value: person.city },
    { label: t('bio'), value: person.bio },
    { label: t('linkedinUrl'), value: person.linkedin_url },
    { label: t('knowledge'), value: knowledge ? t(`knowledgeOptions.${knowledge}`) : null },
    { label: t('aiRisks'), value: person.ai_risks },
    { label: t('realName'), value: person.real_name },
    { label: t('email'), value: person.email },
    {
      label: t('joinedAt'),
      value: person.joined_at
        ? format.dateTime(new Date(person.joined_at), { dateStyle: 'medium' })
        : null,
    },
  ].flatMap(({ label, value }) => (value ? [{ label, value }] : []))

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-4xl font-bold">{person.display_name}</h1>
        <LevelBadge level={person.level} />
      </div>

      <Card>
        {details.length === 0 ? (
          <p>{t('noDetails')}</p>
        ) : (
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[auto_1fr]">
            {details.map(({ label, value }) => (
              <div key={label} className="contents">
                <dt className="font-semibold">{label}</dt>
                <dd className="whitespace-pre-line break-words">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </Card>

      <ActivityFeedPlaceholder />
    </div>
  )
}
