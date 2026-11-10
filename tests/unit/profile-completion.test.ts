import { describe, expect, it } from 'vitest'
import { profileCompletion } from '@/lib/domain/profile-completion'

describe('profileCompletion', () => {
  it('is complete when city and bio are filled in', () => {
    expect(profileCompletion({ city: 'Testville', bio: 'Hello' })).toEqual({
      missing: [],
      complete: true,
    })
  })

  it('lists what is missing, in order', () => {
    expect(profileCompletion({ city: null, bio: null })).toEqual({
      missing: ['city', 'bio'],
      complete: false,
    })
    expect(profileCompletion({ city: 'Testville', bio: '' }).missing).toEqual(['bio'])
    expect(profileCompletion({ bio: 'Hello' }).missing).toEqual(['city'])
  })

  it('treats whitespace only as blank', () => {
    expect(profileCompletion({ city: '   ', bio: '\n' }).missing).toEqual(['city', 'bio'])
  })
})
