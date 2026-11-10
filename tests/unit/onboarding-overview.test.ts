import { describe, expect, it } from 'vitest'
import type { OnboardingStep } from '@/lib/domain/onboarding'
import { adminSteps, buildOverview, parseStepFilter } from '@/lib/domain/onboarding-overview'

const step = (
  key: string,
  confirmedBy: OnboardingStep['confirmedBy'],
  position: number,
  active = true,
): OnboardingStep => ({
  id: `id-${key}`,
  key,
  titleKey: `onboarding.steps.${key}`,
  confirmedBy,
  position,
  active,
})

const STEPS = [
  step('one_to_one', 'admin', 8),
  step('read_doc', 'self', 3),
  step('signal', 'admin', 2),
  step('first_call', 'admin', 6),
  step('old_admin', 'admin', 9, false),
]

const member = (id: string, joinedAt: string) => ({
  id,
  displayName: `Member ${id}`,
  realName: `Real ${id}`,
  joinedAt,
})

describe('adminSteps', () => {
  it('keeps only active admin-confirmed steps, in position order', () => {
    expect(adminSteps(STEPS).map((s) => s.key)).toEqual(['signal', 'first_call', 'one_to_one'])
  })
})

describe('parseStepFilter', () => {
  it('accepts the key of an admin step', () => {
    expect(parseStepFilter('signal', STEPS)).toBe('signal')
  })

  it.each([undefined, '', 'read_doc', 'old_admin', 'nope', ['signal']])('ignores %j', (value) => {
    expect(parseStepFilter(value, STEPS)).toBeNull()
  })
})

describe('buildOverview', () => {
  const members = [member('b', '2026-02-01'), member('a', '2026-01-01'), member('c', '2026-03-01')]

  it('lists members with an open admin step, oldest first, with every admin step', () => {
    const rows = buildOverview(STEPS, members, [
      { userId: 'a', stepId: 'id-signal' },
      { userId: 'c', stepId: 'id-signal' },
      { userId: 'c', stepId: 'id-first_call' },
      { userId: 'c', stepId: 'id-one_to_one' },
    ])
    expect(rows.map((row) => row.id)).toEqual(['a', 'b'])
    expect(rows[0].steps.map((s) => [s.key, s.done])).toEqual([
      ['signal', true],
      ['first_call', false],
      ['one_to_one', false],
    ])
  })

  it('drops people whose admin steps are all done, and ignores self and inactive steps', () => {
    const rows = buildOverview(
      STEPS,
      [member('a', '2026-01-01')],
      ['id-signal', 'id-first_call', 'id-one_to_one'].map((stepId) => ({ userId: 'a', stepId })),
    )
    expect(rows).toEqual([])
  })

  it('applies the step filter to members for whom that step is open', () => {
    const completions = [{ userId: 'a', stepId: 'id-signal' }]
    expect(buildOverview(STEPS, members, completions, 'signal').map((r) => r.id)).toEqual([
      'b',
      'c',
    ])
    expect(buildOverview(STEPS, members, completions, 'first_call')).toHaveLength(3)
  })

  it('returns an empty list when there are no admin steps or no members', () => {
    expect(buildOverview([step('x', 'self', 1)], members, [])).toEqual([])
    expect(buildOverview(STEPS, [], [])).toEqual([])
  })
})
