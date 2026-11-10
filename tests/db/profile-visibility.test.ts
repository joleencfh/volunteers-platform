// P-01: per-field profile visibility, get_profile, update_own_profile and profile_visibility RLS.
// Pattern: tests/db/example-rls.test.ts. Spec section 7, ADR-0014.
import { afterAll, describe, expect, it } from 'vitest'
import {
  DEFAULT_TIERS,
  FIXED_FIELDS,
  PROFILE_FIELDS,
  type ProfileField,
  VISIBILITY_TIERS,
  type VisibilityTier,
} from '@/lib/domain/profile-fields'
import { actAs, inRolledBackTransaction, isDenied, sql, type Tx } from './helpers/db'
import {
  addAuthUser,
  addMember,
  everyoneSharesAGroup,
  fillProfile,
  setTier,
} from './helpers/members'

afterAll(async () => {
  await sql.end({ timeout: 2 })
})

const VIEWERS = [
  'self',
  'other member',
  'member sharing a group',
  'admin',
  'deactivated viewer',
  'non-member',
] as const
type Viewer = (typeof VIEWERS)[number]

/** Spec section 7. Undefined means the viewer gets no profile row at all. */
function expectedVisible(viewer: Viewer, tier: VisibilityTier): boolean | undefined {
  switch (viewer) {
    case 'self':
    case 'admin':
      return true
    case 'other member':
      return tier === 'members'
    case 'member sharing a group':
      return tier !== 'admin'
    case 'deactivated viewer':
    case 'non-member':
      return undefined
  }
}

/** Creates the viewer as the superuser, before actAs(). */
async function addViewer(tx: Tx, viewer: Viewer, owner: string): Promise<string> {
  switch (viewer) {
    case 'self':
      return owner
    case 'other member':
      return addMember(tx)
    case 'member sharing a group':
      await everyoneSharesAGroup(tx)
      return addMember(tx)
    case 'admin':
      return addMember(tx, { isAdmin: true })
    case 'deactivated viewer':
      return addMember(tx, { status: 'deactivated' })
    case 'non-member':
      return addAuthUser(tx)
  }
}

async function profileAs(tx: Tx, viewer: string, owner: string) {
  await actAs(tx, { role: 'authenticated', userId: viewer })
  return tx`select * from public.get_profile(${owner})`
}

const matrix = PROFILE_FIELDS.flatMap((field) =>
  VISIBILITY_TIERS.flatMap((tier) =>
    VIEWERS.map((viewer) => {
      const visible = expectedVisible(viewer, tier)
      const outcome =
        visible === undefined ? 'gets no profile' : visible ? 'sees it' : 'does not see it'
      return { field, tier, viewer, visible, outcome }
    }),
  ),
)

describe('get_profile visibility matrix', () => {
  it.each(matrix)(
    '$field at tier $tier: $viewer $outcome',
    async ({ field, tier, viewer, visible }) => {
      await inRolledBackTransaction(async (tx) => {
        const owner = await addMember(tx)
        await fillProfile(tx, owner)
        await setTier(tx, owner, field, tier)
        const viewerId = await addViewer(tx, viewer, owner)

        const rows = await profileAs(tx, viewerId, owner)
        if (visible === undefined) {
          expect(rows.length).toBe(0)
          return
        }
        expect(rows.length).toBe(1)
        const value = rows[0]?.[field]
        if (visible) expect(value).not.toBeNull()
        else expect(value).toBeNull()
      })
    },
  )
})

describe('get_profile', () => {
  it('uses the same defaults as lib/domain/profile-fields.ts when nothing is chosen', async () => {
    await inRolledBackTransaction(async (tx) => {
      const owner = await addMember(tx)
      await fillProfile(tx, owner)
      const other = await addMember(tx)
      const inSql: Record<string, string> = {}
      for (const field of PROFILE_FIELDS) {
        const [row] = await tx`select public.profile_field_default_tier(${field}) as tier`
        inSql[field] = row?.tier
      }
      expect(inSql).toEqual(DEFAULT_TIERS)

      const [plain] = await profileAs(tx, other, owner)
      await actAs(tx, 'superuser')
      await everyoneSharesAGroup(tx)
      const [grouped] = await profileAs(tx, other, owner)
      const seen: Record<string, VisibilityTier> = {}
      for (const field of PROFILE_FIELDS) {
        seen[field] =
          plain?.[field] !== null ? 'members' : grouped?.[field] !== null ? 'group' : 'admin'
      }
      expect(seen).toEqual(DEFAULT_TIERS)
    })
  })

  it('returns only the profile columns, never how someone heard of PauseAI or flags', async () => {
    await inRolledBackTransaction(async (tx) => {
      const owner = await addMember(tx)
      const [row] = await profileAs(tx, owner, owner)
      expect(Object.keys(row ?? {}).sort()).toEqual(
        ['id', 'display_name', 'level', ...PROFILE_FIELDS, ...FIXED_FIELDS].sort(),
      )
    })
  })

  it('always shows display name and level to another member', async () => {
    await inRolledBackTransaction(async (tx) => {
      const owner = await addMember(tx, { level: 'fresh' })
      const other = await addMember(tx)
      const [row] = await profileAs(tx, other, owner)
      expect(row).toMatchObject({ id: owner, display_name: `Display ${owner}`, level: 'fresh' })
    })
  })

  it.each(['other member', 'member sharing a group'] as const)(
    'never returns the fixed fields to a %s, even with every tier widened',
    async (viewer) => {
      await inRolledBackTransaction(async (tx) => {
        const owner = await addMember(tx)
        await fillProfile(tx, owner)
        for (const field of PROFILE_FIELDS) await setTier(tx, owner, field, 'members')
        await tx`update public.users set first_active_at = now(), last_login_at = now()
          where id = ${owner}`
        const viewerId = await addViewer(tx, viewer, owner)
        const [row] = await profileAs(tx, viewerId, owner)
        for (const field of FIXED_FIELDS) expect(row?.[field]).toBeNull()
        for (const field of PROFILE_FIELDS) expect(row?.[field]).not.toBeNull()
      })
    },
  )

  it.each(['self', 'admin'] as const)('returns the fixed fields to %s', async (viewer) => {
    await inRolledBackTransaction(async (tx) => {
      const owner = await addMember(tx)
      await tx`update public.users set first_active_at = now(), last_login_at = now()
        where id = ${owner}`
      const viewerId = await addViewer(tx, viewer, owner)
      const [row] = await profileAs(tx, viewerId, owner)
      for (const field of FIXED_FIELDS) expect(row?.[field]).not.toBeNull()
      expect(row?.email).toBe(`${owner}@example.test`)
    })
  })

  it('returns no profile of a deactivated person, not even to an admin', async () => {
    await inRolledBackTransaction(async (tx) => {
      const former = await addMember(tx, { status: 'deactivated' })
      const admin = await addMember(tx, { isAdmin: true })
      expect((await profileAs(tx, admin, former)).length).toBe(0)
      expect((await profileAs(tx, former, former)).length).toBe(0)
    })
  })

  it('treats a deactivated admin as nobody', async () => {
    await inRolledBackTransaction(async (tx) => {
      const owner = await addMember(tx)
      const former = await addMember(tx, { isAdmin: true, status: 'deactivated' })
      expect((await profileAs(tx, former, owner)).length).toBe(0)
    })
  })

  it('denies anon', async () => {
    await inRolledBackTransaction(async (tx) => {
      const owner = await addMember(tx)
      await actAs(tx, { role: 'anon' })
      expect(await isDenied(tx, () => tx`select * from public.get_profile(${owner})`)).toBe(true)
    })
  })
})

describe('visibility building blocks', () => {
  it('shares_working_group is a stub returning false until W-01', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await addMember(tx)
      const b = await addMember(tx)
      const [row] = await tx`select public.shares_working_group(${a}, ${b}) as shared`
      expect(row?.shared).toBe(false)
    })
  })

  it('hides the group tier from other members while the stub is in place', async () => {
    await inRolledBackTransaction(async (tx) => {
      const owner = await addMember(tx)
      await fillProfile(tx, owner)
      const other = await addMember(tx)
      const [row] = await profileAs(tx, other, owner)
      expect(row?.ai_safety_knowledge).toBeNull()
      expect(row?.ai_risks).toBeNull()
    })
  })

  it('can_view_profile_field answers false for unknown fields, even for an admin', async () => {
    await inRolledBackTransaction(async (tx) => {
      const owner = await addMember(tx)
      const admin = await addMember(tx, { isAdmin: true })
      for (const field of ['email', 'real_name', 'is_admin', 'nonsense']) {
        const [row] =
          await tx`select public.can_view_profile_field(${admin}, ${owner}, ${field}) as ok`
        expect(row?.ok).toBe(false)
      }
      const [own] = await tx`select public.can_view_profile_field(${owner}, ${owner}, 'city') as ok`
      expect(own?.ok).toBe(true)
    })
  })

  it.each([
    [
      'can_view_profile_field',
      (tx: Tx, a: string, b: string) =>
        tx`select public.can_view_profile_field(${a}, ${b}, 'city')`,
    ],
    [
      'shares_working_group',
      (tx: Tx, a: string, b: string) => tx`select public.shares_working_group(${a}, ${b})`,
    ],
    [
      'profile_field_default_tier',
      (tx: Tx) => tx`select public.profile_field_default_tier('city')`,
    ],
  ] as const)('keeps %s out of reach of members', async (_name, call) => {
    await inRolledBackTransaction(async (tx) => {
      const member = await addMember(tx)
      const other = await addMember(tx)
      await actAs(tx, { role: 'authenticated', userId: member })
      expect(await isDenied(tx, () => call(tx, member, other))).toBe(true)
    })
  })
})

describe('profile_visibility', () => {
  it('lets a member read, add, change and remove their own choices', async () => {
    await inRolledBackTransaction(async (tx) => {
      const member = await addMember(tx)
      await actAs(tx, { role: 'authenticated', userId: member })
      await tx`insert into public.profile_visibility (user_id, field, tier)
        values (${member}, 'city', 'members')`
      const changed = await tx`update public.profile_visibility set tier = 'group'
        where user_id = ${member} and field = 'city'`
      expect(changed.count).toBe(1)
      const rows = await tx`select field, tier from public.profile_visibility`
      expect(rows).toEqual([{ field: 'city', tier: 'group' }])
      const removed = await tx`delete from public.profile_visibility where user_id = ${member}`
      expect(removed.count).toBe(1)
    })
  })

  it("stops a member reading or writing another member's choices", async () => {
    await inRolledBackTransaction(async (tx) => {
      const member = await addMember(tx)
      const other = await addMember(tx)
      await setTier(tx, other, 'city', 'admin')
      await actAs(tx, { role: 'authenticated', userId: member })

      expect((await tx`select * from public.profile_visibility`).length).toBe(0)
      const inserted = () => tx`insert into public.profile_visibility (user_id, field, tier)
        values (${other}, 'bio', 'members')`
      expect(await isDenied(tx, inserted)).toBe(true)
      const widened = await tx`update public.profile_visibility set tier = 'members'
        where user_id = ${other}`
      expect(widened.count).toBe(0)
      expect((await tx`delete from public.profile_visibility where user_id = ${other}`).count).toBe(
        0,
      )
    })
  })

  it('stops a member moving their choice onto someone else', async () => {
    await inRolledBackTransaction(async (tx) => {
      const member = await addMember(tx)
      const other = await addMember(tx)
      await setTier(tx, member, 'city', 'members')
      await actAs(tx, { role: 'authenticated', userId: member })
      const moved = () => tx`update public.profile_visibility set user_id = ${other}
        where user_id = ${member}`
      expect(await isDenied(tx, moved)).toBe(true)
    })
  })

  it("lets an admin read every member's choices but not change them", async () => {
    await inRolledBackTransaction(async (tx) => {
      const admin = await addMember(tx, { isAdmin: true })
      const member = await addMember(tx)
      await setTier(tx, member, 'city', 'members')
      await actAs(tx, { role: 'authenticated', userId: admin })
      expect((await tx`select user_id from public.profile_visibility`).length).toBe(1)
      const changed = await tx`update public.profile_visibility set tier = 'admin'
        where user_id = ${member}`
      expect(changed.count).toBe(0)
    })
  })

  it.each([
    ['a deactivated member', (tx: Tx) => addMember(tx, { status: 'deactivated' })],
    ['a non-member', (tx: Tx) => addAuthUser(tx)],
  ] as const)('refuses %s their own choices', async (_name, add) => {
    await inRolledBackTransaction(async (tx) => {
      const id = await add(tx)
      await actAs(tx, { role: 'authenticated', userId: id })
      const inserted = () => tx`insert into public.profile_visibility (user_id, field, tier)
        values (${id}, 'city', 'members')`
      expect(await isDenied(tx, inserted)).toBe(true)
    })
  })

  it('denies anon', async () => {
    await inRolledBackTransaction(async (tx) => {
      const member = await addMember(tx)
      await setTier(tx, member, 'city', 'members')
      await actAs(tx, { role: 'anon' })
      expect(await isDenied(tx, () => tx`select * from public.profile_visibility`)).toBe(true)
    })
  })

  it.each([
    ['an unknown field', 'email', 'members'],
    ['an unknown tier', 'city', 'public'],
  ])('refuses %s', async (_name, field, tier) => {
    await inRolledBackTransaction(async (tx) => {
      const member = await addMember(tx)
      await actAs(tx, { role: 'authenticated', userId: member })
      const inserted = () => tx`insert into public.profile_visibility (user_id, field, tier)
        values (${member}, ${field}, ${tier})`
      expect(await isDenied(tx, inserted)).toBe(true)
    })
  })
})

describe('update_own_profile', () => {
  const update = (
    tx: Tx,
    values: Partial<Record<'display_name' | ProfileField, string | null>> = {},
  ) => tx`select public.update_own_profile(
    ${values.display_name ?? 'New name'}, ${values.city ?? ' Elsewhere '}, ${values.bio ?? ''},
    ${values.linkedin_url ?? 'https://example.test/in/new'}, ${values.ai_safety_knowledge ?? 'advanced'},
    ${values.ai_risks ?? 'Synthetic concern'}
  )`

  it('changes only the profile columns of the caller', async () => {
    await inRolledBackTransaction(async (tx) => {
      const member = await addMember(tx)
      const other = await addMember(tx)
      await fillProfile(tx, other)
      const [before] = await tx`select * from public.users where id = ${other}`
      await actAs(tx, { role: 'authenticated', userId: member })
      await update(tx)

      await actAs(tx, 'superuser')
      const [row] = await tx`select * from public.users where id = ${member}`
      expect(row).toMatchObject({
        display_name: 'New name',
        city: 'Elsewhere',
        bio: null,
        linkedin_url: 'https://example.test/in/new',
        ai_safety_knowledge: 'advanced',
        ai_risks: 'Synthetic concern',
        level: 'new',
        is_admin: false,
        status: 'active',
        email: `${member}@example.test`,
        real_name: `Real ${member}`,
      })
      const [after] = await tx`select * from public.users where id = ${other}`
      expect(after).toEqual(before)
    })
  })

  it.each([
    ['a blank display name', { display_name: '   ' }],
    ['a display name over 60 characters', { display_name: 'x'.repeat(61) }],
    ['a link that is not https', { linkedin_url: 'http://example.test' }],
    ['an unknown knowledge level', { ai_safety_knowledge: 'expert' }],
    ['a bio over 500 characters', { bio: 'x'.repeat(501) }],
  ] as const)('refuses %s', async (_name, values) => {
    await inRolledBackTransaction(async (tx) => {
      const member = await addMember(tx)
      await actAs(tx, { role: 'authenticated', userId: member })
      expect(await isDenied(tx, () => update(tx, values))).toBe(true)
    })
  })

  it.each([
    ['a deactivated member', (tx: Tx) => addMember(tx, { status: 'deactivated' })],
    ['a non-member', (tx: Tx) => addAuthUser(tx)],
  ] as const)('refuses %s', async (_name, add) => {
    await inRolledBackTransaction(async (tx) => {
      const id = await add(tx)
      await actAs(tx, { role: 'authenticated', userId: id })
      expect(await isDenied(tx, () => update(tx))).toBe(true)
    })
  })

  it('denies anon', async () => {
    await inRolledBackTransaction(async (tx) => {
      await actAs(tx, { role: 'anon' })
      expect(await isDenied(tx, () => update(tx))).toBe(true)
    })
  })

  it('leaves members without any direct update path on users', async () => {
    await inRolledBackTransaction(async (tx) => {
      const member = await addMember(tx)
      await actAs(tx, { role: 'authenticated', userId: member })
      const direct = await tx`update public.users set bio = 'x', level = 'experienced'
        where id = ${member}`
      expect(direct.count).toBe(0)
    })
  })
})
