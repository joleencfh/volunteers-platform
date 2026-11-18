import Link from 'next/link'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { ActivityForm } from '@/components/activities/ActivityForm'
import { Card } from '@/components/ui/display'
import { requireUser } from '@/lib/authz'
import { requireWgMember } from '@/lib/authz/wg'
import { parseSelectableType } from '@/lib/domain/activity-input'
import { getActivityType, selectableTypes } from '@/lib/domain/activity-types'
import { isValidSlug, toGroupView } from '@/lib/domain/groups'
import { getTranslations } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'

type Params = Promise<{ slug: string }>
type SearchParams = Promise<{ type?: string | string[] }>

export default function NewActivityPage({
  params,
  searchParams,
}: {
  params: Params
  searchParams: SearchParams
}) {
  return (
    <Suspense fallback={null}>
      <NewActivityContent params={params} searchParams={searchParams} />
    </Suspense>
  )
}

async function NewActivityContent({
  params,
  searchParams,
}: {
  params: Params
  searchParams: SearchParams
}) {
  await connection()
  await requireUser()
  const { slug } = await params
  if (!isValidSlug(slug)) notFound()

  const supabase = await createClient()
  const { data } = await supabase.rpc('get_working_group', { p_slug: slug })
  const row = data?.[0]
  if (!row) notFound()
  const group = toGroupView(row)
  // Fresh and experienced members of the group and admins; a new volunteer gets the not-found screen.
  await requireWgMember(group.id, 'fresh')

  const t = await getTranslations('activities')
  const tt = await getTranslations('activityTypes')
  const types = selectableTypes()
  const { type: typeParam } = await searchParams
  const typeKey = parseSelectableType(typeParam, types)
  const definition = typeKey ? getActivityType(typeKey) : undefined

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <p>
        <Link href={`/groups/${group.slug}?tab=activities`} className="font-semibold underline">
          {t('backToList', { name: group.name })}
        </Link>
      </p>
      <h1 className="text-4xl font-bold">{t('newTitle')}</h1>

      <nav aria-label={t('typePicker')} className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">{t('typePicker')}</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {types.map((type) => (
            <li key={type.key}>
              <Link
                href={`/groups/${group.slug}/activities/new?type=${type.key}`}
                aria-current={type.key === typeKey ? 'true' : undefined}
                className={`flex h-full min-h-11 flex-col gap-1 rounded-lg border-2 p-4 ${
                  type.key === typeKey
                    ? 'border-ink bg-brand text-ink'
                    : 'border-line-strong bg-paper text-ink'
                }`}
              >
                <span className="font-semibold">{tt(type.labelKey as never)}</span>
                <span className="text-sm">{tt(type.descriptionKey as never)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {definition ? (
        <Card className="flex flex-col gap-4">
          <h2 className="text-xl font-bold">
            {t('formTitle', { type: tt(definition.labelKey as never) })}
          </h2>
          <ActivityForm
            key={definition.key}
            groupId={group.id}
            slug={group.slug}
            type={definition.key}
            fields={definition.fields}
          />
        </Card>
      ) : (
        <p>{t('pickTypeFirst')}</p>
      )}
    </div>
  )
}
