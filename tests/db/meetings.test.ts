// W-05: meetings and group links. Spec section 3 (fresh members and above manage meetings and
// links) and section 5. Policies and the link-only update guard come from W-01 (ADR-0018);
// tests/db/working-groups-rls.test.ts covers the same rules in a smaller form, this file is the
// per-story proof. Pattern: tests/db/working-groups-rls.test.ts. Runs in CI against local Supabase.
import { afterAll, describe, expect, it } from 'vitest'
import { canEditGroupContent } from '@/lib/domain/groups'
import { actAs, inRolledBackTransaction, isDenied, sql } from './helpers/db'
import { actor, as, MEETING_URL, ROLES, rowsChanged, world } from './helpers/groups'

afterAll(async () => {
  await sql.end({ timeout: 2 })
})

const AGENDA_URL = 'https://docs.example.test/agenda'

describe('meetings: who may read', () => {
  it.each(ROLES)('$name reads the meetings of the group only as a member or admin', (role) =>
    inRolledBackTransaction(async (tx) => {
      const w = await world(tx)
      await as(tx, w.ids[role.name])
      const rows = await tx`select id from public.wg_meetings where group_id = ${w.group}`
      const sees = actor(role).isMember || actor(role).isAdmin
      expect(rows.length).toBe(sees ? 1 : 0)
    }),
  )

  it('shows anon nothing', () =>
    inRolledBackTransaction(async (tx) => {
      await world(tx)
      await actAs(tx, { role: 'anon' })
      expect(await isDenied(tx, () => tx`select id from public.wg_meetings`)).toBe(true)
    }))
})

describe('meetings: who may write', () => {
  it.each(ROLES)('$name adds a meeting only when they may edit content', (role) =>
    inRolledBackTransaction(async (tx) => {
      const w = await world(tx)
      const me = w.ids[role.name]
      await as(tx, me)
      const added = () => tx`
        insert into public.wg_meetings (group_id, starts_at, meeting_url, agenda_url, created_by)
        values (${w.group}, now() + interval '3 days', ${MEETING_URL}, ${AGENDA_URL}, ${me})`
      expect(await isDenied(tx, added)).toBe(!canEditGroupContent(actor(role)))
    }),
  )

  it.each(ROLES)('$name changes a meeting only when they may edit content', (role) =>
    inRolledBackTransaction(async (tx) => {
      const w = await world(tx)
      await as(tx, w.ids[role.name])
      const changed = await rowsChanged(
        tx,
        () => tx`update public.wg_meetings set agenda_url = ${AGENDA_URL} where id = ${w.meeting}`,
      )
      expect(changed).toBe(canEditGroupContent(actor(role)) ? 1 : 0)
    }),
  )

  it.each(ROLES)('$name deletes a meeting only when they may edit content', (role) =>
    inRolledBackTransaction(async (tx) => {
      const w = await world(tx)
      await as(tx, w.ids[role.name])
      const deleted = await rowsChanged(
        tx,
        () => tx`delete from public.wg_meetings where id = ${w.meeting}`,
      )
      expect(deleted).toBe(canEditGroupContent(actor(role)) ? 1 : 0)
    }),
  )

  it('refuses links that are not https, and lets an agenda link be cleared', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await world(tx)
      await as(tx, w.ids['fresh member'])
      const insecureAgenda = () => tx`
        update public.wg_meetings set agenda_url = 'http://docs.example.test' where id = ${w.meeting}`
      const insecureMeeting = () => tx`
        update public.wg_meetings set meeting_url = 'javascript:alert(1)' where id = ${w.meeting}`
      expect(await isDenied(tx, insecureAgenda)).toBe(true)
      expect(await isDenied(tx, insecureMeeting)).toBe(true)
      const cleared = await rowsChanged(
        tx,
        () => tx`update public.wg_meetings set agenda_url = null where id = ${w.meeting}`,
      )
      expect(cleared).toBe(1)
    }))

  it('keeps a fresh member of another group out of this group meetings', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await world(tx)
      await as(tx, w.ids['fresh non-member'])
      const changed = await rowsChanged(
        tx,
        () => tx`update public.wg_meetings set agenda_url = ${AGENDA_URL} where id = ${w.meeting}`,
      )
      expect(changed).toBe(0)
    }))
})

describe('group links', () => {
  const setLinks = (tx: Parameters<typeof rowsChanged>[0], group: string) =>
    rowsChanged(
      tx,
      () => tx`
        update public.working_groups
        set signal_url = 'https://signal.group/#synthetic', docs_url = ${AGENDA_URL}
        where id = ${group}`,
    )

  it.each(ROLES)('$name sets the links only when they may edit content', (role) =>
    inRolledBackTransaction(async (tx) => {
      const w = await world(tx)
      await as(tx, w.ids[role.name])
      // A non-member sees no row, so the update matches nothing.
      const changed = await setLinks(tx, w.group)
      expect(changed).toBe(canEditGroupContent(actor(role)) ? 1 : 0)
    }),
  )

  it('lets a fresh member clear a link', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await world(tx)
      await as(tx, w.ids['fresh member'])
      const changed = await rowsChanged(
        tx,
        () =>
          tx`update public.working_groups set signal_url = null, docs_url = null where id = ${w.group}`,
      )
      expect(changed).toBe(1)
    }))

  it('refuses a link that is not https', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await world(tx)
      await as(tx, w.ids['fresh member'])
      const insecure = () => tx`
        update public.working_groups set signal_url = 'http://signal.example.test' where id = ${w.group}`
      expect(await isDenied(tx, insecure)).toBe(true)
    }))

  it.each(['name', 'description', 'slug'])(
    'refuses a fresh member who changes the %s, and allows an admin',
    (column) =>
      inRolledBackTransaction(async (tx) => {
        const w = await world(tx)
        const change = () =>
          tx`update public.working_groups set ${tx(column)} = ${column === 'slug' ? `changed-${w.group.slice(0, 8)}` : 'Changed'} where id = ${w.group}`
        await as(tx, w.ids['fresh member'])
        expect(await isDenied(tx, change)).toBe(true)
        await as(tx, w.ids['experienced member'])
        expect(await isDenied(tx, change)).toBe(true)
        await as(tx, w.ids['admin'])
        expect(await isDenied(tx, change)).toBe(false)
      }),
  )

  it('refuses a fresh member who archives the group or changes links together with the name', () =>
    inRolledBackTransaction(async (tx) => {
      const w = await world(tx)
      await as(tx, w.ids['fresh member'])
      const archive = () => tx`
        update public.working_groups set archived_at = now() where id = ${w.group}`
      const mixed = () => tx`
        update public.working_groups
        set signal_url = 'https://signal.group/#x', name = 'Changed' where id = ${w.group}`
      expect(await isDenied(tx, archive)).toBe(true)
      expect(await isDenied(tx, mixed)).toBe(true)
    }))
})
