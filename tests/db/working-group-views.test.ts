// W-01 (part 2): the limited view of working groups through list_working_groups() and
// get_working_group(). Pattern: tests/db/working-groups-rls.test.ts. Spec section 5, ADR-0018.
import { afterAll, describe, expect, it } from 'vitest'
import { actAs, inRolledBackTransaction, isDenied, sql, type Tx } from './helpers/db'
import { actor, addGroup, addToGroup, as, ROLES, weekStart, world } from './helpers/groups'
import { addAuthUser, addMember } from './helpers/members'

afterAll(async () => {
  await sql.end({ timeout: 2 })
})

const LIST_COLUMNS = [
  'archived',
  'description',
  'id',
  'is_member',
  'lead_display_name',
  'lead_user_id',
  'name',
  'slug',
]
const GET_COLUMNS = [...LIST_COLUMNS, 'docs_url', 'signal_url'].sort()
const SIGNAL_URL = 'https://signal.example.test/g'
const DOCS_URL = 'https://docs.example.test/g'

async function slugOf(tx: Tx, group: string): Promise<string> {
  const [row] = await tx`select slug from public.working_groups where id = ${group}`
  return row?.slug
}

async function setLinks(tx: Tx, group: string): Promise<void> {
  await tx`
    update public.working_groups set signal_url = ${SIGNAL_URL}, docs_url = ${DOCS_URL}
    where id = ${group}`
}

const listed = (tx: Tx, group: string) =>
  tx`select * from public.list_working_groups() where id = ${group}`
const fetched = (tx: Tx, slug: string) => tx`select * from public.get_working_group(${slug})`

describe('list_working_groups', () => {
  it.each(ROLES)('gives $name the limited fields only, or nothing when deactivated', (role) =>
    inRolledBackTransaction(async (tx) => {
      const w = await world(tx)
      await as(tx, w.ids[role.name])
      const rows = await listed(tx, w.group)
      if (role.status === 'deactivated') {
        expect(rows.length).toBe(0)
        expect((await tx`select 1 from public.list_working_groups()`).length).toBe(0)
        return
      }
      expect(rows.length).toBe(1)
      expect(Object.keys(rows[0] ?? {}).sort()).toEqual(LIST_COLUMNS)
      expect(rows[0]).toMatchObject({
        name: 'Synthetic group',
        description: 'A synthetic group for tests.',
        is_member: actor(role).isMember,
        archived: false,
        lead_user_id: w.ids['new member'],
        lead_display_name: `Display ${w.ids['new member']}`,
      })
    }),
  )

  it('includes the seeded Lobbying group for any active member', () =>
    inRolledBackTransaction(async (tx) => {
      const me = await addMember(tx)
      await as(tx, me)
      const rows = await tx`select slug, is_member from public.list_working_groups()`
      expect(rows).toContainEqual({ slug: 'lobbying', is_member: false })
    }))

  it('gives nothing to someone signed in without a member row', () =>
    inRolledBackTransaction(async (tx) => {
      await world(tx)
      const stranger = await addAuthUser(tx)
      await as(tx, stranger)
      expect((await tx`select 1 from public.list_working_groups()`).length).toBe(0)
    }))
})

describe('get_working_group', () => {
  it.each(ROLES)('gives $name the links only as a member or admin', (role) =>
    inRolledBackTransaction(async (tx) => {
      const w = await world(tx)
      await setLinks(tx, w.group)
      const slug = await slugOf(tx, w.group)
      await as(tx, w.ids[role.name])
      const rows = await fetched(tx, slug)
      if (role.status === 'deactivated') {
        expect(rows.length).toBe(0)
        return
      }
      const sees = actor(role).isAdmin || actor(role).isMember
      expect(rows.length).toBe(1)
      expect(Object.keys(rows[0] ?? {}).sort()).toEqual(GET_COLUMNS)
      expect(rows[0]).toMatchObject({
        id: w.group,
        is_member: actor(role).isMember,
        lead_user_id: w.ids['new member'],
        signal_url: sees ? SIGNAL_URL : null,
        docs_url: sees ? DOCS_URL : null,
      })
    }),
  )

  it('returns no row for an unknown slug', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await world(tx)
      await as(tx, w.ids.admin)
      expect((await fetched(tx, 'no-such-group')).length).toBe(0)
    }))

  it('gives nothing to someone signed in without a member row', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await world(tx)
      const slug = await slugOf(tx, w.group)
      const stranger = await addAuthUser(tx)
      await as(tx, stranger)
      expect((await fetched(tx, slug)).length).toBe(0)
    }))
})

describe('archived groups', () => {
  it('are listed and fetched only for admins, marked archived and with links', () =>
    inRolledBackTransaction(async (tx) => {
      const group = await addGroup(tx, { archived: true })
      await setLinks(tx, group)
      const slug = await slugOf(tx, group)
      const member = await addMember(tx, { level: 'experienced' })
      const outsider = await addMember(tx)
      const admin = await addMember(tx, { isAdmin: true })
      await addToGroup(tx, group, member)
      for (const id of [member, outsider]) {
        await as(tx, id)
        expect((await listed(tx, group)).length).toBe(0)
        expect((await fetched(tx, slug)).length).toBe(0)
      }
      await as(tx, admin)
      expect(await listed(tx, group)).toEqual([expect.objectContaining({ archived: true })])
      expect(await fetched(tx, slug)).toEqual([
        expect.objectContaining({ archived: true, is_member: false, signal_url: SIGNAL_URL }),
      ])
    }))
})

describe('lead of the week', () => {
  it("shows no lead when only past and future weeks are assigned, or this week's lead is deactivated", () =>
    inRolledBackTransaction(async (tx) => {
      const pastAndFuture = await addGroup(tx)
      const deactivatedLead = await addGroup(tx)
      const lead = await addMember(tx)
      const gone = await addMember(tx, { status: 'deactivated' })
      const viewer = await addMember(tx)
      await addToGroup(tx, pastAndFuture, lead)
      await addToGroup(tx, deactivatedLead, gone)
      await tx`
        insert into public.wg_leads (group_id, week_start, user_id) values
          (${pastAndFuture}, ${weekStart(-1)}, ${lead}), (${pastAndFuture}, ${weekStart(1)}, ${lead}),
          (${deactivatedLead}, ${weekStart()}, ${gone})`
      await as(tx, viewer)
      for (const group of [pastAndFuture, deactivatedLead]) {
        expect(await listed(tx, group)).toEqual([
          expect.objectContaining({ lead_user_id: null, lead_display_name: null }),
        ])
      }
    }))

  it("does not show one group's lead on another group", () =>
    inRolledBackTransaction(async (tx) => {
      const w = await world(tx)
      const other = await addGroup(tx)
      await as(tx, w.ids['fresh non-member'])
      expect(await listed(tx, other)).toEqual([expect.objectContaining({ lead_user_id: null })])
    }))
})

describe('anon', () => {
  it('may call neither function', () =>
    inRolledBackTransaction(async (tx) => {
      await world(tx)
      await actAs(tx, { role: 'anon' })
      expect(await isDenied(tx, () => tx`select * from public.list_working_groups()`)).toBe(true)
      expect(await isDenied(tx, () => tx`select * from public.get_working_group('lobbying')`)).toBe(
        true,
      )
    }))
})
