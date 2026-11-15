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

/**
 * Self-confirmed steps that are completed from a read-and-confirm window instead of a plain
 * button (the welcome document and the current activities).
 */
export const WINDOW_STEP_KEYS: readonly string[] = ['read_welcome_document', 'looked_at_activities']

/** True when the checklist row can offer a plain "mark as done" button (while it is open). */
export function hasMarkDoneButton(item: ChecklistItem): boolean {
  return item.confirmedBy === 'self' && !WINDOW_STEP_KEYS.includes(item.key)
}

export type StepWindowKind = 'welcome' | 'activities'

/** Which read-and-confirm window a step opens, or null for a step without one. */
export function stepWindowKind(key: string): StepWindowKind | null {
  if (key === 'read_welcome_document') return 'welcome'
  if (key === 'looked_at_activities') return 'activities'
  return null
}

/**
 * The step whose window opens by itself on the home page (first-login prompt): the welcome
 * document while it is still open. The activities window never opens by itself.
 */
export function autoOpenStepKey(items: readonly ChecklistItem[]): string | null {
  const welcome = items.find((item) => item.key === 'read_welcome_document')
  return welcome && !welcome.done && welcome.confirmedBy === 'self' ? welcome.key : null
}
