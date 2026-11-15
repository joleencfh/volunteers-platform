import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { Card, EmptyState } from '@/components/ui/display'
import { requireAdmin } from '@/lib/authz'
import {
  adminSteps,
  buildOverview,
  parseStepFilter,
  type OverviewCompletion,
} from '@/lib/domain/onboarding-overview'
import { getFormatter, getTranslations } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'
import { StepToggle } from './StepToggle'

type SearchParams = Promise<{ step?: string | string[] }>

export default function AdminOnboardingPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={null}>
      <OnboardingContent searchParams={searchParams} />
    </Suspense>
  )
}

async function OnboardingContent({ searchParams }: { searchParams: SearchParams }) {
  // The session is read with a timestamp, so wait for the request instead of prerendering.
  await connection()
  await requireAdmin()
  const query = await searchParams
  const t = await getTranslations('admin.onboarding')
  const tAll = await getTranslations()
  const format = await getFormatter()

  // The RLS client: only an admin's policies let other people's rows through.
  const supabase = await createClient()
  const [{ data: stepRows }, { data: memberRows }, { data: completionRows }] = await Promise.all([
    supabase.from('onboarding_steps').select('id, key, title_key, confirmed_by, position, active'),
    supabase.from('users').select('id, display_name, real_name, joined_at').eq('status', 'active'),
    supabase.from('user_onboarding').select('user_id, step_id'),
  ])

  const steps = (stepRows ?? []).map((step) => ({
    id: step.id,
    key: step.key,
    titleKey: step.title_key,
    confirmedBy: step.confirmed_by,
    position: step.position,
    active: step.active,
  }))
  const filter = parseStepFilter(query.step, steps)
  const completions: OverviewCompletion[] = (completionRows ?? []).map((row) => ({
    userId: row.user_id,
    stepId: row.step_id,
  }))
  const rows = buildOverview(
    steps,
    (memberRows ?? []).map((member) => ({
      id: member.id,
      displayName: member.display_name,
      realName: member.real_name,
      joinedAt: member.joined_at,
    })),
    completions,
    filter,
  )
  const stepTitle = (titleKey: string, key: string) =>
    tAll.has(titleKey as never) ? tAll(titleKey as never) : key

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-4xl font-bold">{t('title')}</h1>
      <p className="max-w-prose text-muted">{t('intro')}</p>

      <nav aria-label={t('filterLabel')}>
        <ul className="flex flex-wrap gap-2">
          <li>
            <FilterLink href="/admin/onboarding" current={filter === null}>
              {t('filterAll')}
            </FilterLink>
          </li>
          {adminSteps(steps).map((step) => (
            <li key={step.key}>
              <FilterLink href={`/admin/onboarding?step=${step.key}`} current={filter === step.key}>
                {stepTitle(step.titleKey, step.key)}
              </FilterLink>
            </li>
          ))}
        </ul>
      </nav>

      {rows.length === 0 ? (
        <EmptyState title={t('empty')} />
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((row) => (
            <li key={row.id}>
              <Card className="flex flex-col gap-3">
                <div>
                  <h2 className="text-xl font-bold">{row.displayName}</h2>
                  <p className="text-muted">
                    {t('realName')}: {row.realName} · {t('joinedAt')}:{' '}
                    {format.dateTime(new Date(row.joinedAt), { dateStyle: 'medium' })}
                  </p>
                </div>
                <div role="group" aria-label={t('stepsFor', { name: row.displayName })}>
                  {row.steps.map((step) => (
                    <StepToggle
                      key={step.key}
                      userId={row.id}
                      stepKey={step.key}
                      label={stepTitle(step.titleKey, step.key)}
                      initialDone={step.done}
                    />
                  ))}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FilterLink({
  href,
  current,
  children,
}: {
  href: string
  current: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      className={`inline-flex min-h-11 items-center rounded-full border-2 px-4 font-semibold ${
        current ? 'border-ink bg-brand text-ink' : 'border-line-strong bg-paper text-ink'
      }`}
    >
      {children}
    </Link>
  )
}
