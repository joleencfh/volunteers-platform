// T-05: who writes a postmortem and what the function changes (spec section 5; save_postmortem in
// supabase/migrations/20261118090512_activity_postmortem.sql). Needs a local Supabase, so it runs
// in CI. Fixtures are created as the superuser before the first actAs().
import { afterAll, describe, expect, it } from 'vitest'
import { canEditPostmortem } from '@/lib/domain/postmortem'
import { actAs, inRolledBackTransaction, sql, type Tx } from './helpers/db'
import { activityWorld, addActivity, addParticipant, errorCodeOf } from './helpers/activities'
import { actor, as, ROLES } from './helpers/groups'
import { addMember } from './helpers/members'

afterAll(async () => {
  await sql.end({ timeout: 2 })
})

const save = (tx: Tx, activity: string, went = 'Went well') =>
  tx`select public.save_postmortem(${activity}, ${went}, ${'  To improve  '}, ${''})`

describe('save_postmortem: every role, participating or not', () => {
  for (const participates of [false, true]) {
    it.each(ROLES)(
      `$name ${participates ? 'taking part' : 'not taking part'} in the activity`,
      (role) =>
        inRolledBackTransaction(async (tx) => {
          const w = await activityWorld(tx)
          const me = w.ids[role.name] as string
          if (participates) await addParticipant(tx, w.others, me, 'observer')
          await as(tx, me)
          const a = actor(role)
          // An admin, or an active member who is experienced or takes part, may write; the domain
          // helper states the same rule. A non-member never may.
          const allowed = canEditPostmortem({ ...a, isParticipant: participates })
          const code = await errorCodeOf(tx, () => save(tx, w.others))
          if (allowed) {
            expect(code).toBeNull()
          } else {
            // Outsiders get "not found", members who may only read get "not allowed".
            expect(code).toBe(a.isMember ? '42501' : 'P0002')
          }
          await actAs(tx, 'superuser')
          const [row] = await tx`
            select postmortem_went_well as w, postmortem_improvements as i, postmortem_learnings as l
            from public.activities where id = ${w.others}`
          expect(row).toEqual(
            allowed ? { w: 'Went well', i: 'To improve', l: null } : { w: null, i: null, l: null },
          )
        }),
    )
  }
})

describe('save_postmortem: details', () => {
  const rest = (tx: Tx, id: string) => tx`
    select to_jsonb(a) - 'postmortem_went_well' - 'postmortem_improvements'
      - 'postmortem_learnings' - 'updated_at' as rest
    from public.activities a where id = ${id}`

  it('changes no other column', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      const before = await rest(tx, w.activity)
      await as(tx, w.fresh)
      expect(await errorCodeOf(tx, () => save(tx, w.activity))).toBeNull()
      await actAs(tx, 'superuser')
      const after = await rest(tx, w.activity)
      expect(after[0]?.rest).toEqual(before[0]?.rest)
    }))

  it('lets a participant who cannot edit the activity write the postmortem only', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      await addParticipant(tx, w.activity, w.otherFresh, 'participant')
      await as(tx, w.otherFresh)
      const edited =
        await tx`update public.activities set title = 'Hijacked' where id = ${w.activity}`
      expect(edited.count).toBe(0)
      expect(await errorCodeOf(tx, () => save(tx, w.activity))).toBeNull()
    }))

  it('refuses an archived activity and an archived group with 55000', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      const experienced = w.ids['experienced member'] as string
      await as(tx, experienced)
      expect(await errorCodeOf(tx, () => save(tx, w.archived))).toBe('55000')
      await actAs(tx, 'superuser')
      await tx`update public.working_groups set archived_at = now() where id = ${w.group}`
      await as(tx, experienced)
      expect(await errorCodeOf(tx, () => save(tx, w.activity))).toBe('55000')
    }))

  it('refuses a text over 4000 characters with 23514 and accepts exactly 4000', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      await as(tx, w.fresh)
      expect(await errorCodeOf(tx, () => save(tx, w.activity, 'a'.repeat(4001)))).toBe('23514')
      expect(await errorCodeOf(tx, () => save(tx, w.activity, 'a'.repeat(4000)))).toBeNull()
    }))

  it('clears fields saved blank, and reports an unknown activity as not found', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      await as(tx, w.fresh)
      await save(tx, w.activity)
      await tx`select public.save_postmortem(${w.activity}, ${null}, ${null}, ${null})`
      await actAs(tx, 'superuser')
      const [row] = await tx`
        select postmortem_went_well as w, postmortem_improvements as i from public.activities
        where id = ${w.activity}`
      expect(row).toEqual({ w: null, i: null })
      await as(tx, w.fresh)
      const unknown = '00000000-0000-4000-8000-000000000000'
      expect(await errorCodeOf(tx, () => save(tx, unknown))).toBe('P0002')
    }))

  it('works on the General activity too (any type)', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      await addParticipant(tx, w.general, w.fresh)
      await as(tx, w.fresh)
      expect(await errorCodeOf(tx, () => save(tx, w.general))).toBeNull()
    }))
})

describe('save_postmortem: anon and outsiders', () => {
  it('denies anon', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      await actAs(tx, { role: 'anon' })
      expect(await errorCodeOf(tx, () => save(tx, w.activity))).toBe('42501')
    }))

  it('treats an experienced member of another group as an outsider', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await activityWorld(tx)
      const stranger = await addMember(tx, { level: 'experienced' })
      const extra = await addActivity(tx, w.group)
      await as(tx, stranger)
      expect(await errorCodeOf(tx, () => save(tx, extra))).toBe('P0002')
    }))
})
