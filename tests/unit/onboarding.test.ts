import { describe, expect, it } from 'vitest'
import { buildChecklist, type OnboardingStep } from '@/lib/domain/onboarding'

function step(
  position: number,
  confirmedBy: OnboardingStep['confirmedBy'],
  overrides: Partial<OnboardingStep> = {},
): OnboardingStep {
  return {
    id: `id-${position}`,
    key: `step_${position}`,
    titleKey: `onboarding.steps.step_${position}`,
    confirmedBy,
    position,
    active: true,
    ...overrides,
  }
}

const steps = [step(3, 'self'), step(1, 'auto'), step(2, 'admin'), step(4, 'self')]

describe('buildChecklist', () => {
  it('orders steps by position and flags the completed ones', () => {
    const checklist = buildChecklist(steps, ['id-1', 'id-4'])
    expect(checklist.items.map((item) => [item.key, item.done])).toEqual([
      ['step_1', true],
      ['step_2', false],
      ['step_3', false],
      ['step_4', true],
    ])
  })

  it('counts progress and is not complete while a step is open', () => {
    const checklist = buildChecklist(steps, ['id-1'])
    expect(checklist).toMatchObject({ doneCount: 1, total: 4, complete: false })
  })

  it('is complete when every active step is done', () => {
    const checklist = buildChecklist(steps, ['id-1', 'id-2', 'id-3', 'id-4'])
    expect(checklist).toMatchObject({ doneCount: 4, total: 4, complete: true, nextSelfStep: null })
  })

  it('ignores inactive steps and completions of unknown steps', () => {
    const withInactive = [...steps, step(5, 'admin', { active: false })]
    const checklist = buildChecklist(withInactive, ['id-1', 'id-5', 'unknown'])
    expect(checklist.total).toBe(4)
    expect(checklist.doneCount).toBe(1)
    expect(checklist.items.map((item) => item.key)).not.toContain('step_5')
  })

  it('picks the first open step the volunteer confirms themselves', () => {
    expect(buildChecklist(steps, []).nextSelfStep?.key).toBe('step_3')
    expect(buildChecklist(steps, ['id-3']).nextSelfStep?.key).toBe('step_4')
  })

  it('does not suggest auto or admin steps as the next self step', () => {
    const checklist = buildChecklist([step(1, 'auto'), step(2, 'admin')], [])
    expect(checklist.nextSelfStep).toBeNull()
  })

  it('handles a checklist without steps', () => {
    expect(buildChecklist([], [])).toMatchObject({ items: [], total: 0, complete: true })
  })

  it('does not change the steps it is given', () => {
    const input = [step(2, 'self'), step(1, 'auto')]
    buildChecklist(input, [])
    expect(input.map((s) => s.position)).toEqual([2, 1])
  })
})
