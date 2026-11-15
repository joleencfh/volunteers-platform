// Synthetic working groups for the RLS tests. Call these as the superuser, before actAs().
import type { GroupActor } from '@/lib/domain/groups'
import type { UserLevel } from '@/lib/domain/review'
import { startOfIsoWeek } from '@/lib/domain/week'
import { actAs, isDenied, newUserId, type Tx } from './db'
import { addMember } from './members'

export async function addGroup(tx: Tx, options: { archived?: boolean } = {}): Promise<string> {
  const slug = `group-${newUserId().slice(0, 8)}`
  const [row] = await tx`
    insert into public.working_groups (slug, name, description, archived_at)
    values (${slug}, 'Synthetic group', 'A synthetic group for tests.',
      ${options.archived ? new Date() : null})
    returning id`
  return row?.id
}

export async function addToGroup(tx: Tx, groupId: string, ...userIds: string[]): Promise<void> {
  for (const userId of userIds) {
    await tx`insert into public.wg_members (group_id, user_id) values (${groupId}, ${userId})`
  }
}

/** Monday (UTC) of the week `weeksFromNow` away from the current one, as YYYY-MM-DD. */
export function weekStart(weeksFromNow = 0): string {
  const start = startOfIsoWeek(new Date())
  start.setUTCDate(start.getUTCDate() + 7 * weeksFromNow)
  return start.toISOString().slice(0, 10)
}

export type Role = {
  name: string
  level: UserLevel
  isAdmin: boolean
  isMember: boolean
  status?: 'deactivated'
}

/** The people the W-01 policy tests run every rule against, members and non-members of one group. */
export const ROLES: Role[] = [
  { name: 'new member', level: 'new', isAdmin: false, isMember: true },
  { name: 'fresh member', level: 'fresh', isAdmin: false, isMember: true },
  { name: 'experienced member', level: 'experienced', isAdmin: false, isMember: true },
  { name: 'new non-member', level: 'new', isAdmin: false, isMember: false },
  { name: 'fresh non-member', level: 'fresh', isAdmin: false, isMember: false },
  { name: 'experienced non-member', level: 'experienced', isAdmin: false, isMember: false },
  { name: 'admin', level: 'new', isAdmin: true, isMember: false },
  {
    name: 'deactivated member',
    level: 'experienced',
    isAdmin: false,
    isMember: true,
    status: 'deactivated',
  },
]

export const MEMBER_ROWS = ROLES.filter((role) => role.isMember).length

/** What the rules see: a deactivated person counts as neither admin nor member. */
export function actor(role: Role): GroupActor {
  const active = role.status !== 'deactivated'
  return { level: role.level, isAdmin: active && role.isAdmin, isMember: active && role.isMember }
}

export const MEETING_URL = 'https://meet.example.test/synthetic'

/** One group with a person per role, a pending request, this week's lead, a past lead and a meeting. */
export async function world(tx: Tx) {
  const group = await addGroup(tx)
  const ids: Record<string, string> = {}
  for (const role of ROLES) {
    const id = await addMember(tx, {
      level: role.level,
      isAdmin: role.isAdmin,
      status: role.status,
    })
    ids[role.name] = id
    if (role.isMember) await addToGroup(tx, group, id)
  }
  const requester = await addMember(tx)
  const rejected = await addMember(tx)
  const [request] = await tx`
    insert into public.wg_join_requests (group_id, user_id) values (${group}, ${requester})
    returning id`
  await tx`
    insert into public.wg_join_requests (group_id, user_id, status, decided_at)
    values (${group}, ${rejected}, 'rejected', now())`
  const newMember = ids['new member'] as string
  await tx`
    insert into public.wg_leads (group_id, week_start, user_id)
    values (${group}, ${weekStart()}, ${newMember}), (${group}, ${weekStart(-1)}, ${newMember})`
  const [meeting] = await tx`
    insert into public.wg_meetings (group_id, starts_at, meeting_url)
    values (${group}, now() + interval '1 day', ${MEETING_URL})
    returning id`
  return { group, ids, requester, rejected, request: request?.id, meeting: meeting?.id }
}

export const as = (tx: Tx, userId: string | undefined) =>
  actAs(tx, { role: 'authenticated', userId: userId as string })

/** Runs a write that may be refused by a policy (error) or filtered by one (no rows). */
export async function rowsChanged(
  tx: Tx,
  statement: () => Promise<{ count: number }>,
): Promise<number> {
  let count = 0
  await isDenied(tx, async () => {
    count = (await statement()).count
  })
  return count
}
