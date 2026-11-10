// The admin onboarding overview (spec section 8). Pure: no I/O.
// Lists active members who still have an open admin-confirmed step.
import type { OnboardingStep } from './onboarding'

export type OverviewMember = {
  id: string
  displayName: string
  realName: string
  joinedAt: string
}

export type OverviewCompletion = { userId: string; stepId: string }

export type OverviewRow = OverviewMember & {
  steps: { id: string; key: string; titleKey: string; done: boolean }[]
}

/** The active steps an admin confirms, in position order. */
export function adminSteps(steps: readonly OnboardingStep[]): OnboardingStep[] {
  return steps
    .filter((step) => step.active && step.confirmedBy === 'admin')
    .toSorted((a, b) => a.position - b.position)
}

/** The step key from the query string if it names an admin-confirmed step, else null. */
export function parseStepFilter(
  value: string | string[] | undefined,
  steps: readonly OnboardingStep[],
): string | null {
  if (typeof value !== 'string') return null
  return adminSteps(steps).some((step) => step.key === value) ? value : null
}

/**
 * Members with at least one open admin-confirmed step, oldest member first. With `stepKey`, only
 * members for whom that step is open. Every row carries all admin steps (done or open) so the
 * page can show a toggle for each.
 */
export function buildOverview(
  steps: readonly OnboardingStep[],
  members: readonly OverviewMember[],
  completions: readonly OverviewCompletion[],
  stepKey: string | null = null,
): OverviewRow[] {
  const admin = adminSteps(steps)
  const doneBy = new Map<string, Set<string>>()
  for (const { userId, stepId } of completions) {
    const set = doneBy.get(userId) ?? new Set<string>()
    set.add(stepId)
    doneBy.set(userId, set)
  }

  return members
    .map((member) => ({
      ...member,
      steps: admin.map((step) => ({
        id: step.id,
        key: step.key,
        titleKey: step.titleKey,
        done: doneBy.get(member.id)?.has(step.id) ?? false,
      })),
    }))
    .filter((row) =>
      stepKey === null
        ? row.steps.some((step) => !step.done)
        : row.steps.some((step) => step.key === stepKey && !step.done),
    )
    .toSorted((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.id.localeCompare(b.id))
}
