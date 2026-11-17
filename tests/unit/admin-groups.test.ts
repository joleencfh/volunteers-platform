import { describe, expect, it } from 'vitest'
import {
  changedGroupFields,
  createGroupSchema,
  groupMemberSchema,
  onGroupCreated,
  updateGroupSchema,
} from '@/lib/domain/admin-groups'

const ID = '8b1c2f3e-4d5a-4b6c-8d7e-9f0a1b2c3d4e'

describe('createGroupSchema', () => {
  const valid = { name: ' Outreach ', slug: 'outreach-2', description: ' Talks. ' }

  it('trims the text and accepts a lowercase slug', () => {
    expect(createGroupSchema.parse(valid)).toEqual({
      name: 'Outreach',
      slug: 'outreach-2',
      description: 'Talks.',
    })
  })

  it('refuses a bad slug, a blank name and an over-long description', () => {
    for (const bad of [
      { slug: 'Outreach' },
      { slug: 'out reach' },
      { slug: '-outreach' },
      { slug: '' },
      { name: '   ' },
      { description: 'x'.repeat(501) },
    ]) {
      expect(createGroupSchema.safeParse({ ...valid, ...bad }).success).toBe(false)
    }
  })
})

describe('updateGroupSchema', () => {
  const valid = { groupId: ID, name: 'A', description: 'B', signalUrl: '', docsUrl: '' }

  it('turns blank links into null and keeps https links', () => {
    expect(
      updateGroupSchema.parse({ ...valid, docsUrl: ' https://docs.example.test/x ' }),
    ).toMatchObject({ signalUrl: null, docsUrl: 'https://docs.example.test/x' })
  })

  it('refuses http links and ids that are not UUIDs', () => {
    expect(updateGroupSchema.safeParse({ ...valid, signalUrl: 'http://x.test' }).success).toBe(
      false,
    )
    expect(updateGroupSchema.safeParse({ ...valid, groupId: 'x' }).success).toBe(false)
  })

  it('has no slug input: a slug in the form is dropped', () => {
    expect(updateGroupSchema.parse({ ...valid, slug: 'other' })).not.toHaveProperty('slug')
  })
})

describe('groupMemberSchema', () => {
  it('needs two UUIDs', () => {
    expect(groupMemberSchema.safeParse({ groupId: ID, userId: ID }).success).toBe(true)
    expect(groupMemberSchema.safeParse({ groupId: ID, userId: 'x' }).success).toBe(false)
  })
})

describe('changedGroupFields', () => {
  const current = { name: 'A', description: 'B', signal_url: null, docs_url: 'https://d.test' }

  it('lists nothing when nothing changed', () => {
    expect(
      changedGroupFields(current, {
        name: 'A',
        description: 'B',
        signalUrl: null,
        docsUrl: 'https://d.test',
      }),
    ).toEqual([])
  })

  it('names each changed field and never its value', () => {
    expect(
      changedGroupFields(current, {
        name: 'A2',
        description: 'B',
        signalUrl: 'https://s.test',
        docsUrl: null,
      }),
    ).toEqual(['name', 'signal_url', 'docs_url'])
  })
})

describe('onGroupCreated', () => {
  it('is a seam for T-01 and does nothing yet', async () => {
    await expect(onGroupCreated(ID)).resolves.toBeUndefined()
  })
})
