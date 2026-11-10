// The onboarding checklist (spec section 8). Pure: no I/O.
// Step definitions come from the onboarding_steps table; the pages fetch them and pass them in.

export type OnboardingConfirmer = 'self' | 'auto' | 'admin'

export type OnboardingStep = {
  id: string
  key: string
  titleKey: string
  confirmedBy: OnboardingConfirmer
  position: number
  active: boolean
}

export type ChecklistItem = OnboardingStep & { done: boolean }

export type Checklist = {
  items: ChecklistItem[]
  doneCount: number
  total: number
  /** True once every active step is done (also when there are no active steps). */
  complete: boolean
  /** The first open step the volunteer confirms themselves, if any. */
  nextSelfStep: ChecklistItem | null
}

/** Active steps in position order, each flagged done when its id is among the completed ones. */
export function buildChecklist(
  steps: readonly OnboardingStep[],
  completedStepIds: Iterable<string>,
): Checklist {
  const completed = new Set(completedStepIds)
  const items = steps
    .filter((step) => step.active)
    .toSorted((a, b) => a.position - b.position)
    .map((step) => ({ ...step, done: completed.has(step.id) }))
  const doneCount = items.filter((item) => item.done).length
  return {
    items,
    doneCount,
    total: items.length,
    complete: doneCount === items.length,
    nextSelfStep: items.find((item) => !item.done && item.confirmedBy === 'self') ?? null,
  }
}
