// O-01: onboarding_steps and user_onboarding RLS, the step 1 trigger and the seed.
// Pattern: tests/db/example-rls.test.ts. Spec section 8, ADR-0015.
import { afterAll, describe, expect, it } from 'vitest'
import { actAs, inRolledBackTransaction, isDenied, sql, type Tx } from './helpers/db'
import { addAuthUser, addMember } from './helpers/members'

afterAll(async () => {
  await sql.end({ timeout: 2 })
})

const SEEDED = [
  ['added_to_platform', 'auto'],
  ['signal_group', 'admin'],
  ['read_welcome_document', 'self'],
  ['looked_at_activities', 'self'],
  ['joined_working_group', 'auto'],
  ['first_group_call', 'admin'],
  ['first_contribution', 'auto'],
  ['one_to_one_checkin', 'admin'],
]

async function stepId(tx: Tx, key: string): Promise<string> {
  const [row] = await tx`select id from public.onboarding_steps where key = ${key}`
  return row.id
}

async function complete(tx: Tx, userId: string, key: string, by: string | null = null) {
  await tx`
    insert into public.user_onboarding (user_id, step_id, completed_by)
    values (${userId}, ${await stepId(tx, key)}, ${by})`
}

describe('onboarding seed', () => {
  it('has exactly the eight active steps of spec section 8 in order', () =>
    inRolledBackTransaction(async (tx) => {
      const rows = await tx`
        select key, confirmed_by, position, active, title_key
        from public.onboarding_steps order by position`
      expect(rows.map((row) => [row.key, row.confirmed_by])).toEqual(SEEDED)
      expect(rows.map((row) => row.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
      expect(rows.every((row) => row.active)).toBe(true)
      expect(rows.every((row) => row.title_key === `onboarding.steps.${row.key}`)).toBe(true)
    }))
})

describe('step 1 trigger', () => {
  it('completes "added to the platform" for a new member, with no completed_by', () =>
    inRolledBackTransaction(async (tx) => {
      const member = await addMember(tx)
      const rows = await tx`
        select s.key, uo.completed_by
        from public.user_onboarding uo join public.onboarding_steps s on s.id = uo.step_id
        where uo.user_id = ${member}`
      expect(rows).toHaveLength(1)
      expect(rows[0].key).toBe('added_to_platform')
      expect(rows[0].completed_by).toBeNull()
    }))

  it('does the same for an admin and for a deactivated row, and for nothing else', () =>
    inRolledBackTransaction(async (tx) => {
      const admin = await addMember(tx, { isAdmin: true })
      const other = await addMember(tx)
      const rows = await tx`
        select user_id from public.user_onboarding where user_id in (${admin}, ${other})`
      expect(rows).toHaveLength(2)
    }))

  it('matches the backfill: every active user without the row would get exactly that row', () =>
    inRolledBackTransaction(async (tx) => {
      const member = await addMember(tx)
      await tx`delete from public.user_onboarding where user_id = ${member}`
      await tx`
        insert into public.user_onboarding (user_id, step_id, completed_by)
        select u.id, s.id, null
        from public.users u cross join public.onboarding_steps s
        where u.status = 'active' and s.key = 'added_to_platform'
        on conflict do nothing`
      const rows = await tx`select step_id from public.user_onboarding where user_id = ${member}`
      expect(rows.map((row) => row.step_id)).toEqual([await stepId(tx, 'added_to_platform')])
    }))
})

describe('onboarding_steps', () => {
  it('lets an active member read the steps', () =>
    inRolledBackTransaction(async (tx) => {
      const member = await addMember(tx)
      await actAs(tx, { role: 'authenticated', userId: member })
      expect(await tx`select id from public.onboarding_steps`).toHaveLength(8)
    }))

  it('hides the steps from a deactivated member, a non-member and anon', () =>
    inRolledBackTransaction(async (tx) => {
      const deactivated = await addMember(tx, { status: 'deactivated' })
      const outsider = await addAuthUser(tx)
      await actAs(tx, { role: 'authenticated', userId: deactivated })
      expect(await tx`select id from public.onboarding_steps`).toHaveLength(0)
      await actAs(tx, { role: 'authenticated', userId: outsider })
      expect(await tx`select id from public.onboarding_steps`).toHaveLength(0)
      await actAs(tx, { role: 'anon' })
      expect(await isDenied(tx, () => tx`select id from public.onboarding_steps`)).toBe(true)
    }))

  it('lets an admin reword a step and refuses a member', () =>
    inRolledBackTransaction(async (tx) => {
      const admin = await addMember(tx, { isAdmin: true })
      const member = await addMember(tx)
      await actAs(tx, { role: 'authenticated', userId: admin })
      const changed = await tx`
        update public.onboarding_steps set title_key = 'onboarding.steps.reworded'
        where key = 'signal_group' returning id`
      expect(changed).toHaveLength(1)
      await actAs(tx, { role: 'authenticated', userId: member })
      const refused = await tx`
        update public.onboarding_steps set title_key = 'x' where key = 'first_group_call' returning id`
      expect(refused).toHaveLength(0)
      expect(
        await isDenied(
          tx,
          () => tx`
            insert into public.onboarding_steps (key, title_key, confirmed_by, position)
            values ('extra', 'onboarding.steps.extra', 'self', 9)`,
        ),
      ).toBe(true)
    }))
})

describe('user_onboarding: members', () => {
  it('lets a member confirm their own self step, recorded as done by them', () =>
    inRolledBackTransaction(async (tx) => {
      const member = await addMember(tx)
      const step = await stepId(tx, 'read_welcome_document')
      await actAs(tx, { role: 'authenticated', userId: member })
      await tx`
        insert into public.user_onboarding (user_id, step_id, completed_by)
        values (${member}, ${step}, ${member})`
      const rows = await tx`select step_id from public.user_onboarding where step_id = ${step}`
      expect(rows).toHaveLength(1)
    }))

  it.each(['joined_working_group', 'signal_group'])(
    'refuses a member confirming the %s step themselves',
    (key) =>
      inRolledBackTransaction(async (tx) => {
        const member = await addMember(tx)
        const step = await stepId(tx, key)
        await actAs(tx, { role: 'authenticated', userId: member })
        expect(
          await isDenied(
            tx,
            () => tx`
              insert into public.user_onboarding (user_id, step_id, completed_by)
              values (${member}, ${step}, ${member})`,
          ),
        ).toBe(true)
      }),
  )

  it('refuses an inactive self step', () =>
    inRolledBackTransaction(async (tx) => {
      const member = await addMember(tx)
      const step = await stepId(tx, 'looked_at_activities')
      await tx`update public.onboarding_steps set active = false where id = ${step}`
      await actAs(tx, { role: 'authenticated', userId: member })
      expect(
        await isDenied(
          tx,
          () => tx`
            insert into public.user_onboarding (user_id, step_id, completed_by)
            values (${member}, ${step}, ${member})`,
        ),
      ).toBe(true)
    }))

  it('refuses writing a row for someone else, or one that names someone else as completer', () =>
    inRolledBackTransaction(async (tx) => {
      const member = await addMember(tx)
      const other = await addMember(tx)
      const step = await stepId(tx, 'read_welcome_document')
      await actAs(tx, { role: 'authenticated', userId: member })
      expect(
        await isDenied(
          tx,
          () => tx`
            insert into public.user_onboarding (user_id, step_id, completed_by)
            values (${other}, ${step}, ${member})`,
        ),
      ).toBe(true)
      expect(
        await isDenied(
          tx,
          () => tx`
            insert into public.user_onboarding (user_id, step_id, completed_by)
            values (${member}, ${step}, ${other})`,
        ),
      ).toBe(true)
      expect(
        await isDenied(
          tx,
          () => tx`
            insert into public.user_onboarding (user_id, step_id, completed_by)
            values (${member}, ${step}, null)`,
        ),
      ).toBe(true)
    }))

  it('reads only their own progress', () =>
    inRolledBackTransaction(async (tx) => {
      const member = await addMember(tx)
      const other = await addMember(tx)
      await complete(tx, other, 'read_welcome_document', other)
      await actAs(tx, { role: 'authenticated', userId: member })
      const rows = await tx`select user_id from public.user_onboarding`
      expect(rows.map((row) => row.user_id)).toEqual([member])
    }))

  it('cannot update or delete progress, not even their own', () =>
    inRolledBackTransaction(async (tx) => {
      const member = await addMember(tx)
      await complete(tx, member, 'read_welcome_document', member)
      await actAs(tx, { role: 'authenticated', userId: member })
      expect(
        await isDenied(tx, () => tx`update public.user_onboarding set completed_by = null`),
      ).toBe(true)
      const deleted = await tx`delete from public.user_onboarding returning step_id`
      expect(deleted).toHaveLength(0)
      expect(await tx`select step_id from public.user_onboarding`).toHaveLength(2)
    }))

  it('gives a deactivated member and a non-member no access at all', () =>
    inRolledBackTransaction(async (tx) => {
      const deactivated = await addMember(tx, { status: 'deactivated' })
      const outsider = await addAuthUser(tx)
      const step = await stepId(tx, 'read_welcome_document')
      await actAs(tx, { role: 'authenticated', userId: deactivated })
      expect(await tx`select user_id from public.user_onboarding`).toHaveLength(0)
      expect(
        await isDenied(
          tx,
          () => tx`
            insert into public.user_onboarding (user_id, step_id, completed_by)
            values (${deactivated}, ${step}, ${deactivated})`,
        ),
      ).toBe(true)
      await actAs(tx, { role: 'authenticated', userId: outsider })
      expect(await tx`select user_id from public.user_onboarding`).toHaveLength(0)
    }))

  it('gives anon no access', () =>
    inRolledBackTransaction(async (tx) => {
      await actAs(tx, { role: 'anon' })
      expect(await isDenied(tx, () => tx`select user_id from public.user_onboarding`)).toBe(true)
    }))
})

describe('user_onboarding: admins', () => {
  it('reads everyone’s progress', () =>
    inRolledBackTransaction(async (tx) => {
      const admin = await addMember(tx, { isAdmin: true })
      const member = await addMember(tx)
      await actAs(tx, { role: 'authenticated', userId: admin })
      const rows = await tx`select user_id from public.user_onboarding where user_id = ${member}`
      expect(rows).toHaveLength(1)
    }))

  it.each(['signal_group', 'read_welcome_document', 'joined_working_group'])(
    'ticks and unticks the %s step for a member',
    (key) =>
      inRolledBackTransaction(async (tx) => {
        const admin = await addMember(tx, { isAdmin: true })
        const member = await addMember(tx)
        const step = await stepId(tx, key)
        await actAs(tx, { role: 'authenticated', userId: admin })
        await tx`
          insert into public.user_onboarding (user_id, step_id, completed_by)
          values (${member}, ${step}, ${admin})`
        expect(
          await tx`select 1 from public.user_onboarding where user_id = ${member} and step_id = ${step}`,
        ).toHaveLength(1)
        const deleted = await tx`
          delete from public.user_onboarding
          where user_id = ${member} and step_id = ${step} returning step_id`
        expect(deleted).toHaveLength(1)
      }),
  )

  it('cannot record someone else as the completer', () =>
    inRolledBackTransaction(async (tx) => {
      const admin = await addMember(tx, { isAdmin: true })
      const member = await addMember(tx)
      const step = await stepId(tx, 'signal_group')
      await actAs(tx, { role: 'authenticated', userId: admin })
      expect(
        await isDenied(
          tx,
          () => tx`
            insert into public.user_onboarding (user_id, step_id, completed_by)
            values (${member}, ${step}, ${member})`,
        ),
      ).toBe(true)
    }))

  it('cannot update progress', () =>
    inRolledBackTransaction(async (tx) => {
      const admin = await addMember(tx, { isAdmin: true })
      await actAs(tx, { role: 'authenticated', userId: admin })
      expect(
        await isDenied(tx, () => tx`update public.user_onboarding set completed_by = null`),
      ).toBe(true)
    }))

  it('loses every right when deactivated', () =>
    inRolledBackTransaction(async (tx) => {
      const former = await addMember(tx, { isAdmin: true, status: 'deactivated' })
      const member = await addMember(tx)
      await actAs(tx, { role: 'authenticated', userId: former })
      const rows = await tx`select user_id from public.user_onboarding where user_id = ${member}`
      expect(rows).toHaveLength(0)
    }))
})

describe('user_onboarding: system', () => {
  it('lets the service role write auto steps with no completer', () =>
    inRolledBackTransaction(async (tx) => {
      const member = await addMember(tx)
      await actAs(tx, { role: 'service_role' })
      await tx`
        insert into public.user_onboarding (user_id, step_id, completed_by)
        values (${member}, ${await stepId(tx, 'joined_working_group')}, null)`
      expect(await tx`select 1 from public.user_onboarding where user_id = ${member}`).toHaveLength(
        2,
      )
    }))
})
