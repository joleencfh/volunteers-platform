// The profile feed of latest and planned work (story T-06, part 2; spec section 7: only items in
// groups the viewer can fully see). Needs a local Supabase, so it runs in CI. The owner is the
// `fresh` fixture; `experienced` shares the seeded group with them; `new` is only in a second
// group the owner is not in.
import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { fixtureUser, type FixtureUser } from '../fixtures/users'
import { adminClient, supabaseEnv } from '../helpers/supabase'
import { expectNoSeriousA11yViolations } from './helpers/a11y'
import { loginAs } from './helpers/auth'

test.skip(!supabaseEnv(), 'needs Supabase settings (runs in CI)')

const BASE = 'http://localhost:3000'
const FEED = 'Latest and planned work'
const EMPTY_OTHER = 'Nothing to show from the working groups you can see.'

async function idOf(user: FixtureUser) {
  const { data, error } = await adminClient()
    .from('users')
    .select('id')
    .eq('email', user.email)
    .single()
  if (error) throw error
  return data.id as string
}

test.describe('profile feed of latest and planned work', () => {
  test.describe.configure({ mode: 'serial' })

  const suffix = randomUUID().slice(0, 8)
  const slug = `e2e-profile-work-${suffix}`
  const otherSlug = `e2e-profile-work-other-${suffix}`
  const groupName = `E2E Profile Work ${suffix}`
  const activityTitle = `Profile feed activity ${suffix}`
  const taskTitle = `Profile feed task ${suffix}`
  const otherTitle = `Other group activity ${suffix}`
  const groupIds: string[] = []
  let ownerId = ''
  let newId = ''

  test.beforeEach(async ({ context }) => {
    // The welcome window opens by itself on first login and would cover the page.
    await context.addInitScript(() => {
      window.sessionStorage.setItem('onboarding-window-later:read_welcome_document', '1')
    })
  })

  test.beforeAll(async () => {
    const db = adminClient()
    ownerId = await idOf(fixtureUser('fresh'))
    const experienced = await idOf(fixtureUser('experienced'))
    newId = await idOf(fixtureUser('new'))

    const groups = await db
      .from('working_groups')
      .insert([
        { slug, name: groupName, description: `Synthetic ${suffix}.` },
        { slug: otherSlug, name: `E2E Other ${suffix}`, description: `Synthetic ${suffix}.` },
      ])
      .select('id, slug')
    if (groups.error) throw groups.error
    const group = groups.data.find((row) => row.slug === slug)!.id
    const other = groups.data.find((row) => row.slug === otherSlug)!.id
    groupIds.push(group, other)

    const members = await db.from('wg_members').insert([
      { group_id: group, user_id: ownerId },
      { group_id: group, user_id: experienced },
      { group_id: other, user_id: newId },
    ])
    if (members.error) throw members.error

    const activities = await db
      .from('activities')
      .insert([
        {
          group_id: group,
          type: 'campaign',
          title: activityTitle,
          status: 'active',
          details: { message: `Message ${suffix}` },
          created_by: ownerId,
        },
        {
          group_id: other,
          type: 'campaign',
          title: otherTitle,
          status: 'active',
          details: { message: `Message ${suffix}` },
          created_by: newId,
        },
      ])
      .select('id, title')
    if (activities.error) throw activities.error
    const mine = activities.data.find((row) => row.title === activityTitle)!
    const theirs = activities.data.find((row) => row.title === otherTitle)!
    const participants = await db.from('activity_participants').insert([
      { activity_id: mine.id, user_id: ownerId, role: 'participant' },
      { activity_id: theirs.id, user_id: newId, role: 'participant' },
    ])
    if (participants.error) throw participants.error
    const task = await db.from('tasks').insert({
      activity_id: mine.id,
      group_id: group,
      title: taskTitle,
      assignee_id: ownerId,
      created_by: ownerId,
    })
    if (task.error) throw task.error
  })

  test.afterAll(async () => {
    // Activities, participants and tasks go with the groups (on delete cascade).
    await adminClient().from('working_groups').delete().in('id', groupIds)
  })

  test('the owner sees their own items on /profile', async ({ page, context, baseURL }) => {
    await loginAs(context, fixtureUser('fresh'), baseURL ?? BASE)
    await page.goto('/profile')
    const feed = page.getByRole('region', { name: FEED })
    const activity = feed.getByRole('link', { name: activityTitle, exact: true })
    await expect(activity).toBeVisible()
    await expect(activity).toHaveAttribute('href', new RegExp(`/groups/${slug}/activities/`))
    await expect(feed.getByRole('link', { name: taskTitle, exact: true })).toBeVisible()
    await expect(feed.getByText(otherTitle)).toHaveCount(0)
  })

  test('a fellow group member sees the group items on the profile, and the page passes axe', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, fixtureUser('experienced'), baseURL ?? BASE)
    await page.goto(`/people/${ownerId}`)
    const feed = page.getByRole('region', { name: FEED })
    await expect(feed.getByRole('link', { name: activityTitle, exact: true })).toBeVisible()
    await expect(feed.getByRole('link', { name: taskTitle, exact: true })).toBeVisible()
    await expect(feed.getByText(groupName).first()).toBeVisible()
    await expect(feed.getByText(EMPTY_OTHER)).toHaveCount(0)
    await expectNoSeriousA11yViolations(page)
  })

  test('a member of another group sees none of the items and the empty state', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, fixtureUser('new'), baseURL ?? BASE)
    await page.goto(`/people/${ownerId}`)
    const feed = page.getByRole('region', { name: FEED })
    await expect(feed.getByRole('heading', { name: FEED })).toBeVisible()
    await expect(feed.getByText(activityTitle)).toHaveCount(0)
    await expect(feed.getByText(taskTitle)).toHaveCount(0)
    await expect(feed.locator(`a[href*="/groups/${slug}/"]`)).toHaveCount(0)

    // Other spec files run in parallel and may put `new` and `fresh` in one group for a while;
    // the empty state is certain only when they share no group at all.
    const { data: newGroups } = await adminClient()
      .from('wg_members')
      .select('group_id')
      .eq('user_id', newId)
    const { data: ownerGroups } = await adminClient()
      .from('wg_members')
      .select('group_id')
      .eq('user_id', ownerId)
    const ownerSet = new Set((ownerGroups ?? []).map((row) => row.group_id))
    if (!(newGroups ?? []).some((row) => ownerSet.has(row.group_id))) {
      await expect(feed.getByText(EMPTY_OTHER)).toBeVisible()
    }
  })
})
