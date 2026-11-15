import { Badge, EmptyState } from '@/components/ui/display'
import type { CurrentActivity } from '@/components/onboarding/CurrentActivitiesList'
import { hasMarkDoneButton, stepWindowKind, type ChecklistItem } from '@/lib/domain/onboarding'
import { getTranslations } from '@/lib/i18n/server'
import { CompleteStepButton } from './CompleteStepButton'
import { StepWindow } from './StepWindow'

export type ChecklistRow = ChecklistItem & { title: string }

/** The member's onboarding checklist (spec section 8), or a short message once it is complete. */
export async function OnboardingChecklist({
  rows,
  doneCount,
  total,
  complete,
  autoOpenKey,
  welcomeUrl,
  activities,
}: {
  rows: ChecklistRow[]
  doneCount: number
  total: number
  complete: boolean
  /** The step whose window opens by itself on this page load, if any. */
  autoOpenKey: string | null
  welcomeUrl: string | null
  activities: readonly CurrentActivity[]
}) {
  const t = await getTranslations('onboarding')

  // Nothing to list: no active steps, or every one of them done.
  if (complete) {
    return <EmptyState title={t('completeTitle')} description={t('completeBody')} />
  }

  return (
    <section aria-labelledby="checklist-heading" className="flex flex-col gap-4">
      <h2 id="checklist-heading" className="text-2xl font-bold">
        {t('title')}
      </h2>
      <div className="flex flex-col gap-1">
        <p>{t('progress', { done: doneCount, total })}</p>
        <progress
          className="h-3 w-full max-w-md accent-brand"
          value={doneCount}
          max={total}
          aria-label={t('progressLabel')}
        >
          {t('progress', { done: doneCount, total })}
        </progress>
      </div>
      <ol className="flex flex-col gap-3">
        {rows.map((row) => {
          const windowKind = stepWindowKind(row.key)
          return (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-line p-4"
            >
              <div className="flex flex-col gap-1">
                <span className="font-semibold">{row.title}</span>
                <span className="text-sm text-muted">{t(`confirmedBy.${row.confirmedBy}`)}</span>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone={row.done ? 'success' : 'neutral'}>
                  {row.done ? t('state.done') : t('state.open')}
                </Badge>
                {hasMarkDoneButton(row) && (
                  <CompleteStepButton stepKey={row.key} stepTitle={row.title} done={row.done} />
                )}
                {windowKind && row.confirmedBy === 'self' && (
                  <StepWindow
                    stepKey={row.key}
                    stepTitle={row.title}
                    kind={windowKind}
                    done={row.done}
                    autoOpen={row.key === autoOpenKey}
                    welcomeUrl={welcomeUrl}
                    activities={activities}
                  />
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
