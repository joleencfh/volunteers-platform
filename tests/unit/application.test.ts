import { describe, expect, it } from 'vitest'
import { parseApplication } from '@/lib/domain/application'

const valid = {
  displayName: ' Ada ',
  firstName: 'Ada',
  lastName: 'Example',
  email: '  Ada@Example.test ',
  city: 'Test City',
  motivation: '',
  heardVia: 'word_of_mouth',
  heardOther: '',
  knowledge: 'basic',
  privacyAccepted: 'on',
  specialCategoryConsent: 'on',
}

describe('parseApplication', () => {
  it('accepts a complete form and normalises it', () => {
    expect(parseApplication(valid)).toEqual({
      ok: true,
      data: {
        displayName: 'Ada',
        realName: 'Ada Example',
        email: 'ada@example.test',
        city: 'Test City',
        motivation: null,
        heardVia: 'word_of_mouth',
        heardOther: null,
        knowledge: 'basic',
      },
    })
  })

  it('requires every mandatory field', () => {
    const result = parseApplication({})
    expect(result).toMatchObject({
      ok: false,
      errors: {
        displayName: 'required',
        firstName: 'required',
        lastName: 'required',
        email: 'required',
        city: 'required',
        heardVia: 'required',
        knowledge: 'required',
        privacyAccepted: 'required',
        specialCategoryConsent: 'required',
      },
    })
  })

  it('requires each consent separately', () => {
    expect(parseApplication({ ...valid, privacyAccepted: undefined })).toMatchObject({
      ok: false,
      errors: { privacyAccepted: 'required' },
    })
    expect(parseApplication({ ...valid, specialCategoryConsent: undefined })).toMatchObject({
      ok: false,
      errors: { specialCategoryConsent: 'required' },
    })
  })

  it('rejects a malformed email and an unknown choice', () => {
    expect(parseApplication({ ...valid, email: 'nope' })).toMatchObject({
      errors: { email: 'invalidEmail' },
    })
    expect(parseApplication({ ...valid, heardVia: 'billboard' })).toMatchObject({
      errors: { heardVia: 'invalidChoice' },
    })
    expect(parseApplication({ ...valid, knowledge: 'guru' })).toMatchObject({
      errors: { knowledge: 'invalidChoice' },
    })
  })

  it('asks for the detail when "other" is chosen, and drops it otherwise', () => {
    expect(parseApplication({ ...valid, heardVia: 'other' })).toMatchObject({
      ok: false,
      errors: { heardOther: 'required' },
    })
    expect(parseApplication({ ...valid, heardVia: 'other', heardOther: 'A talk' })).toMatchObject({
      ok: true,
      data: { heardOther: 'A talk' },
    })
    expect(parseApplication({ ...valid, heardOther: 'ignored' })).toMatchObject({
      ok: true,
      data: { heardOther: null },
    })
  })

  it('caps text length', () => {
    expect(parseApplication({ ...valid, motivation: 'x'.repeat(1001) })).toMatchObject({
      errors: { motivation: 'tooLong' },
    })
  })
})
