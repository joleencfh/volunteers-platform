import { describe, expect, it } from 'vitest'
import {
  canEditPostmortem,
  hasPostmortem,
  needsPostmortemPrompt,
  postmortemSchema,
} from '@/lib/domain/postmortem'

const levels = ['new', 'fresh', 'experienced'] as const

describe('canEditPostmortem', () => {
  for (const level of levels) {
    for (const isParticipant of [false, true]) {
      const expected = isParticipant || level === 'experienced'
      it(`member, level ${level}, participant ${isParticipant}: ${expected ? 'edits' : 'reads'}`, () => {
        expect(canEditPostmortem({ level, isAdmin: false, isMember: true, isParticipant })).toBe(
          expected,
        )
      })
    }
  }

  it('lets an admin edit, member or not', () => {
    expect(
      canEditPostmortem({ level: 'new', isAdmin: true, isMember: false, isParticipant: false }),
    ).toBe(true)
  })

  it('never lets a non-member edit, even an experienced one or a participant', () => {
    for (const level of levels) {
      expect(
        canEditPostmortem({ level, isAdmin: false, isMember: false, isParticipant: true }),
      ).toBe(false)
    }
  })
})

describe('postmortemSchema', () => {
  it('trims, and turns blank texts into null', () => {
    expect(
      postmortemSchema.parse({ wentWell: '  Good  ', improvements: '   ', learnings: '' }),
    ).toEqual({ wentWell: 'Good', improvements: null, learnings: null })
  })

  it('accepts exactly 4000 characters and refuses more', () => {
    const ok = 'a'.repeat(4000)
    expect(
      postmortemSchema.safeParse({ wentWell: ok, improvements: '', learnings: '' }).success,
    ).toBe(true)
    expect(
      postmortemSchema.safeParse({ wentWell: '', improvements: ok + 'a', learnings: '' }).success,
    ).toBe(false)
    expect(
      postmortemSchema.safeParse({ wentWell: '', improvements: '', learnings: ok + 'a' }).success,
    ).toBe(false)
  })
})

describe('needsPostmortemPrompt', () => {
  const empty = { went_well: null, improvements: null, learnings: null }

  it('is true for a done activity with nothing written', () => {
    expect(needsPostmortemPrompt({ status: 'done', ...empty })).toBe(true)
    expect(needsPostmortemPrompt({ status: 'done', ...empty, went_well: '  ' })).toBe(true)
  })

  it('is false when any field has text, or the activity is not done', () => {
    expect(needsPostmortemPrompt({ status: 'done', ...empty, learnings: 'Plan earlier' })).toBe(
      false,
    )
    for (const status of ['planned', 'active', 'cancelled']) {
      expect(needsPostmortemPrompt({ status, ...empty })).toBe(false)
    }
  })

  it('hasPostmortem mirrors it', () => {
    expect(hasPostmortem(empty)).toBe(false)
    expect(hasPostmortem({ ...empty, improvements: 'x' })).toBe(true)
  })
})
