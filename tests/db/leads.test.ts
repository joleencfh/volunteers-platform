// W-04: lead of the week. Spec section 3 ("Assign the WG lead for the week") and section 5.
// A lead is a responsibility, not extra permissions. Pattern: tests/db/working-groups-rls.test.ts.
// Run in CI against local Supabase.
import { afterAll, describe, expect, it } from 'vitest'
import { actAs, inRolledBackTransaction, isDenied, sql, type Tx } from './helpers/db'
import { addGroup, addToGroup, as, rowsChanged, weekStart } from './helpers/groups'
import { addMember } from './helpers/members'

afterAll(async () => {
  await sql.end({ timeout: 2 })
})

type Level = 'new' | 'fresh' | 'experienced'

/** A group with one member per level, an experienced member of another group, and an admin. */
async function setup(tx: Tx) {
  const group = await addGroup(tx)
  const otherGroup = await addGroup(tx)
  const members: Record<Level, string> = {
    new: await addMember(tx, { level: 'new' }),
    fresh: await addMember(tx, { level: 'fresh' }),
    experienced: await addMember(tx, { level: 'experienced' }),
  }
  await addToGroup(tx, group, ...Object.values(members))
  const otherExperienced = await addMember(tx, { level: 'experienced' })
  await addToGroup(tx, otherGroup, otherExperienced)
  const outsider = await addMember(tx, { level: 'new' })
  const admin = await addMember(tx, { isAdmin: true })
  const requester = await addMember(tx)
  const [request] = await tx`
    insert into public.wg_join_requests (group_id, user_id) values (${group}, ${requester})
    returning id`
  return { group, members, otherExperienced, outsider, admin, request: request?.id as string }
}

const assign = (tx: Tx, group: string, week: string, user: string, by: string) =>
  tx`insert into public.wg_leads (group_id, week_start, user_id, assigned_by)
     values (${group}, ${week}, ${user}, ${by})`

async function leadOf(tx: Tx, group: string, week: string) {
  await actAs(tx, 'superuser')
  const rows = await tx`
    select user_id, assigned_by from public.wg_leads where group_id = ${group} and week_start = ${week}`
  return rows
}

describe('who may assign the lead', () => {
  it('lets an experienced member of the group assign any member', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await setup(tx)
      await as(tx, w.members.experienced)
      expect(
        await isDenied(tx, () =>
          assign(tx, w.group, weekStart(), w.members.new, w.members.experienced),
        ),
      ).toBe(false)
      const rows = await leadOf(tx, w.group, weekStart())
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        user_id: w.members.new,
        assigned_by: w.members.experienced,
      })
    }))

  it('lets an admin assign, for the current and a later week', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await setup(tx)
      await as(tx, w.admin)
      expect(
        await isDenied(tx, () => assign(tx, w.group, weekStart(), w.members.fresh, w.admin)),
      ).toBe(false)
      expect(
        await isDenied(tx, () => assign(tx, w.group, weekStart(3), w.members.new, w.admin)),
      ).toBe(false)
    }))

  it.each(['new', 'fresh'] as const)('refuses a %s member of the group', (level) =>
    inRolledBackTransaction(async (tx) => {
      const w = await setup(tx)
      await as(tx, w.members[level])
      expect(
        await isDenied(tx, () =>
          assign(tx, w.group, weekStart(), w.members[level], w.members[level]),
        ),
      ).toBe(true)
      expect(await leadOf(tx, w.group, weekStart())).toHaveLength(0)
    }),
  )

  it('refuses an experienced member of ANOTHER group', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await setup(tx)
      await as(tx, w.otherExperienced)
      expect(
        await isDenied(tx, () =>
          assign(tx, w.group, weekStart(), w.members.new, w.otherExperienced),
        ),
      ).toBe(true)
    }))

  it('refuses an outsider and a signed-out caller', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await setup(tx)
      await as(tx, w.outsider)
      expect(
        await isDenied(tx, () => assign(tx, w.group, weekStart(), w.members.new, w.outsider)),
      ).toBe(true)
      await actAs(tx, { role: 'anon' })
      expect(
        await isDenied(tx, () => assign(tx, w.group, weekStart(), w.members.new, w.outsider)),
      ).toBe(true)
    }))

  it('refuses a lead who is not a member of the group', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await setup(tx)
      await as(tx, w.members.experienced)
      expect(
        await isDenied(tx, () =>
          assign(tx, w.group, weekStart(), w.outsider, w.members.experienced),
        ),
      ).toBe(true)
    }))

  it('refuses a past week, and a date that is not a Monday', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await setup(tx)
      await as(tx, w.members.experienced)
      expect(
        await isDenied(tx, () =>
          assign(tx, w.group, weekStart(-1), w.members.new, w.members.experienced),
        ),
      ).toBe(true)
      const tuesday = new Date(`${weekStart(1)}T00:00:00Z`)
      tuesday.setUTCDate(tuesday.getUTCDate() + 1)
      expect(
        await isDenied(tx, () =>
          assign(
            tx,
            w.group,
            tuesday.toISOString().slice(0, 10),
            w.members.new,
            w.members.experienced,
          ),
        ),
      ).toBe(true)
    }))

  it('replaces the row when a week is reassigned, and keeps one row per week', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await setup(tx)
      await actAs(tx, 'superuser')
      await assign(tx, w.group, weekStart(1), w.members.new, w.members.experienced)
      await as(tx, w.members.experienced)
      const changed = await rowsChanged(
        tx,
        () =>
          tx`update public.wg_leads set user_id = ${w.members.fresh}, assigned_by = ${w.members.experienced}
           where group_id = ${w.group} and week_start = ${weekStart(1)}`,
      )
      expect(changed).toBe(1)
      const rows = await leadOf(tx, w.group, weekStart(1))
      expect(rows).toHaveLength(1)
      expect(rows[0]?.user_id).toBe(w.members.fresh)
      // A second row for the same week is refused by the unique constraint.
      await as(tx, w.members.experienced)
      expect(
        await isDenied(tx, () =>
          assign(tx, w.group, weekStart(1), w.members.new, w.members.experienced),
        ),
      ).toBe(true)
    }))

  it('does not let anyone rewrite a past week', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await setup(tx)
      await actAs(tx, 'superuser')
      await assign(tx, w.group, weekStart(-1), w.members.new, w.members.experienced)
      await as(tx, w.members.experienced)
      const changed = await rowsChanged(
        tx,
        () =>
          tx`update public.wg_leads set user_id = ${w.members.fresh}
           where group_id = ${w.group} and week_start = ${weekStart(-1)}`,
      )
      expect(changed).toBe(0)
    }))
})

describe('being lead gives no extra permission', () => {
  /** Makes `level` the lead of the current week, as the superuser, then acts as that person. */
  async function asLead(tx: Tx, level: Level) {
    const w = await setup(tx)
    await actAs(tx, 'superuser')
    await tx`delete from public.wg_leads where group_id = ${w.group}`
    await assign(tx, w.group, weekStart(), w.members[level], w.members.experienced)
    await as(tx, w.members[level])
    return w
  }

  it('a new lead still cannot approve joins', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await asLead(tx, 'new')
      expect(
        await isDenied(tx, () => tx`select public.decide_join_request(${w.request}, true)`),
      ).toBe(true)
    }))

  it.each(['new', 'fresh'] as const)('a %s lead still cannot assign leads', (level) =>
    inRolledBackTransaction(async (tx) => {
      const w = await asLead(tx, level)
      expect(
        await isDenied(tx, () =>
          assign(tx, w.group, weekStart(1), w.members[level], w.members[level]),
        ),
      ).toBe(true)
    }),
  )

  it('a new lead still cannot add meetings or change the group links', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await asLead(tx, 'new')
      expect(
        await isDenied(
          tx,
          () => tx`insert into public.wg_meetings (group_id, starts_at, meeting_url)
                   values (${w.group}, now() + interval '2 days', 'https://meet.example.test/x')`,
        ),
      ).toBe(true)
      const changed = await rowsChanged(
        tx,
        () =>
          tx`update public.working_groups set signal_url = 'https://signal.example.test/x'
           where id = ${w.group}`,
      )
      expect(changed).toBe(0)
    }))
})
