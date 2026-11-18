// Permission regression for milestone M3b (spec sections 3, 5 and 7): for every activity and task
// route, what a signed-out visitor, a non-member, each member level and an admin get, plus the
// profile work feed rule. Needs a local Supabase, so it runs in CI. Assertions check the resulting
// state, not transient messages, and use exact locators where words repeat.
import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { fixtureUser, OUTSIDER, type FixtureUser } from '../fixtures/users'
import { adminClient, supabaseEnv } from '../helpers/supabase'
import { loginAs } from './helpers/auth'

test.skip(!supabaseEnv(), 'needs Supabase settings (runs in CI)')

const BASE = 'http://localhost:3000'
const FEED = 'Latest and planned work'

type Outcome = 'page' | 'login' | 'refused' | 'notFound'

/** Opens the path and tells which of the four outcomes the visitor got. */
async function outcome(page: Page, path: string): Promise<Outcome> {
  await page.goto(path)
  // Pages stream inside <Suspense>, so a redirect or the not-found screen arrives after the HTTP
  // response (the status is already 200). Wait for whichever final state shows up first.
  const notFound = page.getByText(/could not be found/i)
  await Promise.race([
    page.waitForURL(/\/login/, { timeout: 10_000 }).catch(() => undefined),
    notFound.waitFor({ timeout: 10_000 }).catch(() => undefined),
    page
      .getByRole('heading', { level: 1 })
      .first()
      .waitFor({ timeout: 10_000 })
      .catch(() => undefined),
  ])
  const url = new URL(page.url())
  if (url.pathname === '/login') return url.searchParams.has('error') ? 'refused' : 'login'
  if (await notFound.isVisible()) return 'notFound'
  return 'page'
}

async function userOf(user: FixtureUser) {
  const { data, error } = await adminClient()
    .from('users')
    .select('id, display_name')
    .eq('email', user.email)
    .single()
  if (error) throw error
  return data as { id: string; display_name: string }
}

test.describe('activities, tasks and the profile feed: access and visibility', () => {
  // Several tests change the seeded rows (a task is taken, an activity edited), so keep the order.
  test.describe.configure({ mode: 'serial' })

  const suffix = randomUUID().slice(0, 8)
  const slug = `e2e-m3b-${suffix}`
  const otherSlug = `e2e-m3b-other-${suffix}`
  const feedSlug = `e2e-m3b-feed-${suffix}`
  const titles = {
    byExperienced: `Activity by experienced ${suffix}`,
    byFresh: `Activity by fresh ${suffix}`,
    created: `Created by fresh ${suffix}`,
    other: `Other group activity ${suffix}`,
    feed: `Feed activity ${suffix}`,
  }
  const tasks = {
    forNewcomer: `Task to take ${suffix}`,
    finished: `Finished task ${suffix}`,
    created: `Task by fresh ${suffix}`,
    other: `Other group task ${suffix}`,
    feed: `Feed task ${suffix}`,
  }
  const groupIds: string[] = []
  let activityId = ''
  let otherActivityId = ''
  let ownerId = ''
  let newcomerName = ''
  let experiencedName = ''

  test.beforeEach(async ({ context }) => {
    // The welcome window opens by itself on first login and would cover the page.
    await context.addInitScript(() => {
      window.sessionStorage.setItem('onboarding-window-later:read_welcome_document', '1')
    })
  })

  test.beforeAll(async () => {
    const db = adminClient()
    const newcomer = await userOf(fixtureUser('new'))
    const fresh = await userOf(fixtureUser('fresh'))
    const experienced = await userOf(fixtureUser('experienced'))
    newcomerName = newcomer.display_name
    experiencedName = experienced.display_name

    const groups = await db
      .from('working_groups')
      .insert([
        { slug, name: `E2E M3b ${suffix}`, description: `Synthetic ${suffix}.` },
        { slug: otherSlug, name: `E2E M3b other ${suffix}`, description: `Synthetic ${suffix}.` },
        { slug: feedSlug, name: `E2E M3b feed ${suffix}`, description: `Synthetic ${suffix}.` },
      ])
      .select('id, slug')
    if (groups.error) throw groups.error
    const idOfSlug = (value: string) => groups.data.find((group) => group.slug === value)!.id
    const groupId = idOfSlug(slug)
    const otherId = idOfSlug(otherSlug)
    const feedId = idOfSlug(feedSlug)
    groupIds.push(groupId, otherId, feedId)

    // `new`, `fresh` and `experienced` are in the main group. Only `fresh` is in the other group, so
    // `experienced` is a non-member there. A made-up owner and `fresh` share the feed group.
    const email = `e2e-m3b-${suffix}@example.test`
    const created = await db.auth.admin.createUser({ email, email_confirm: true })
    if (created.error) throw created.error
    ownerId = created.data.user.id
    const owner = await db.from('users').insert({
      id: ownerId,
      display_name: `Owner ${suffix}`,
      real_name: 'M3b Owner',
      email,
    })
    if (owner.error) throw owner.error

    const members = await db.from('wg_members').insert([
      { group_id: groupId, user_id: newcomer.id },
      { group_id: groupId, user_id: fresh.id },
      { group_id: groupId, user_id: experienced.id },
      { group_id: otherId, user_id: fresh.id },
      { group_id: feedId, user_id: fresh.id },
      { group_id: feedId, user_id: ownerId },
    ])
    if (members.error) throw members.error

    const activities = await db
      .from('activities')
      .insert([
        {
          group_id: groupId,
          type: 'campaign',
          title: titles.byExperienced,
          status: 'active',
          details: { message: `Message ${suffix}` },
          created_by: experienced.id,
        },
        {
          group_id: groupId,
          type: 'campaign',
          title: titles.byFresh,
          status: 'planned',
          details: { message: `Message ${suffix}` },
          created_by: fresh.id,
        },
        {
          group_id: otherId,
          type: 'campaign',
          title: titles.other,
          status: 'active',
          details: { message: 'Seeded other message' },
          created_by: fresh.id,
        },
        {
          group_id: feedId,
          type: 'campaign',
          title: titles.feed,
          status: 'active',
          details: { message: `Message ${suffix}` },
          created_by: ownerId,
        },
      ])
      .select('id, title')
    if (activities.error) throw activities.error
    const byTitle = (title: string) => activities.data.find((row) => row.title === title)!.id
    activityId = byTitle(titles.byExperienced)
    otherActivityId = byTitle(titles.other)

    const participant = await db
      .from('activity_participants')
      .insert({ activity_id: byTitle(titles.feed), user_id: ownerId, role: 'participant' })
    if (participant.error) throw participant.error

    const seeded = await db.from('tasks').insert([
      {
        activity_id: activityId,
        group_id: groupId,
        title: tasks.forNewcomer,
        status: 'open',
        created_by: experienced.id,
      },
      {
        activity_id: activityId,
        group_id: groupId,
        title: tasks.finished,
        assignee_id: fresh.id,
        status: 'done',
        completion_note: 'Seeded as finished',
        created_by: experienced.id,
      },
      {
        activity_id: otherActivityId,
        group_id: otherId,
        title: tasks.other,
        status: 'open',
        created_by: fresh.id,
      },
      {
        activity_id: byTitle(titles.feed),
        group_id: feedId,
        title: tasks.feed,
        status: 'open',
        assignee_id: ownerId,
        created_by: ownerId,
      },
    ])
    if (seeded.error) throw seeded.error
  })

  test.afterAll(async () => {
    const db = adminClient()
    // Activities, tasks and memberships go with the group (on delete cascade).
    for (const id of groupIds) await db.from('working_groups').delete().eq('id', id)
    if (ownerId) await db.auth.admin.deleteUser(ownerId)
  })

  const routes = () => [
    '/tasks',
    `/groups/${slug}?tab=activities`,
    `/groups/${slug}?tab=tasks`,
    `/groups/${slug}/activities/${activityId}`,
    `/groups/${slug}/activities/new`,
  ]
  const row = (page: Page, title: string) =>
    page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: title }) })

  test('a signed-out visitor is sent to /login from every route', async ({ page }) => {
    for (const path of routes()) {
      expect(await outcome(page, path), path).toBe('login')
    }
  })

  test('a non-member with an account is refused everywhere', async ({ page, context, baseURL }) => {
    await loginAs(context, OUTSIDER, baseURL ?? BASE)
    for (const path of routes()) {
      expect(await outcome(page, path), path).toBe('refused')
    }
  })

  test('a member who is not in the group sees titles and statuses only', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, fixtureUser('experienced'), baseURL ?? BASE)
    // The group of `fresh` only: `experienced` is a signed-in member but not in it.
    expect(await outcome(page, '/tasks')).toBe('page')
    expect(await outcome(page, `/groups/${otherSlug}?tab=activities`)).toBe('page')
    await expect(page.getByText(titles.other)).toBeVisible()
    // Two activities are active here (the seeded one and the automatic General one): one is enough.
    await expect(page.getByText('Active', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Seeded other message')).toHaveCount(0)
    await expect(page.getByRole('link', { name: titles.other })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'New activity', exact: true })).toHaveCount(0)

    // Nothing of the tasks, whichever way they are asked for.
    await page.goto(`/groups/${otherSlug}?tab=tasks`)
    await expect(page.getByRole('heading', { name: 'Details are for members' })).toBeVisible()
    await expect(page.getByText(tasks.other)).toHaveCount(0)

    expect(await outcome(page, `/groups/${otherSlug}/activities/${otherActivityId}`)).toBe(
      'notFound',
    )
    expect(await outcome(page, `/groups/${otherSlug}/activities/new`)).toBe('notFound')
  })

  test('a new member sees the full page but no create forms, and takes and completes a task', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, fixtureUser('new'), baseURL ?? BASE)
    for (const path of routes().slice(0, 4)) {
      expect(await outcome(page, path), path).toBe('page')
    }
    // No create form for activities or tasks.
    expect(await outcome(page, `/groups/${slug}/activities/new`)).toBe('notFound')
    await page.goto(`/groups/${slug}?tab=activities`)
    await expect(page.getByRole('link', { name: titles.byExperienced })).toBeVisible()
    await expect(page.getByRole('link', { name: 'New activity', exact: true })).toHaveCount(0)
    await page.goto(`/groups/${slug}/activities/${activityId}`)
    await expect(page.getByRole('heading', { name: titles.byExperienced, level: 1 })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create task' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Edit this activity' })).toHaveCount(0)

    await row(page, tasks.forNewcomer).getByRole('button', { name: 'Take this task' }).click()
    await expect(
      row(page, tasks.forNewcomer).getByText(`Assigned to ${newcomerName}`),
    ).toBeVisible()
    const mine = row(page, tasks.forNewcomer)
    await mine.getByText('Complete this task', { exact: true }).click()
    await mine.getByLabel('Completion note').fill('Done by a new volunteer')
    await mine.getByRole('button', { name: 'Mark as done' }).click()
    await expect(mine.getByText('Completion note: Done by a new volunteer')).toBeVisible()
    await expect(mine.getByText('Done', { exact: true })).toBeVisible()
    // They cannot reopen it.
    await expect(mine.getByRole('button', { name: 'Reopen task' })).toHaveCount(0)
  })

  test('a fresh member creates activities and tasks but cannot edit others’ activities', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, fixtureUser('fresh'), baseURL ?? BASE)
    for (const path of routes()) {
      expect(await outcome(page, path), path).toBe('page')
    }

    // Creates an activity through the form.
    await page.goto(`/groups/${slug}/activities/new?type=campaign`)
    await page.getByLabel(/^Title/).fill(titles.created)
    await page.getByLabel('Message content or link').fill(`Message ${suffix}`)
    await page.getByRole('button', { name: 'Create activity' }).click()
    await page.waitForURL(/\/activities\/[0-9a-f-]{36}$/)
    await expect(page.getByRole('heading', { name: titles.created, level: 1 })).toBeVisible()

    // Creates a task on someone else's activity.
    await page.goto(`/groups/${slug}/activities/${activityId}`)
    const form = page
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Create task' }) })
    await form.getByLabel(/^Title/).fill(tasks.created)
    await form.getByRole('button', { name: 'Create task' }).click()
    await expect(row(page, tasks.created)).toBeVisible()

    // Cannot edit the activity of an experienced member.
    await expect(page.getByRole('heading', { name: 'Edit this activity' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0)
    // Cannot reopen a done task.
    await expect(
      row(page, tasks.finished).getByRole('button', { name: 'Reopen task' }),
    ).toHaveCount(0)
  })

  test('an experienced member edits another member’s activity', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, fixtureUser('experienced'), baseURL ?? BASE)
    for (const path of routes()) {
      expect(await outcome(page, path), path).toBe('page')
    }
    await page.goto(`/groups/${slug}?tab=activities`)
    await page.getByRole('link', { name: titles.byFresh }).click()
    await page.waitForURL(/\/activities\/[0-9a-f-]{36}$/)
    await expect(page.getByRole('heading', { name: 'Edit this activity' })).toBeVisible()
    await page.getByLabel('Status', { exact: true }).selectOption('active')
    // Wait for the server action's response, then reload: the persisted value is what counts.
    const saved = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('/activities/'),
    )
    await page.getByRole('button', { name: 'Save changes' }).click()
    await saved
    await page.reload()
    await expect(page.getByLabel('Status', { exact: true })).toHaveValue('active')
    // Still no reopen for them.
    await page.goto(`/groups/${slug}/activities/${activityId}`)
    await expect(
      row(page, tasks.finished).getByRole('button', { name: 'Reopen task' }),
    ).toHaveCount(0)
    expect(experiencedName).not.toBe('')
  })

  test('only an admin reopens a done task', async ({ page, context, baseURL }) => {
    await loginAs(context, fixtureUser('admin'), baseURL ?? BASE)
    for (const path of routes()) {
      expect(await outcome(page, path), path).toBe('page')
    }
    await page.goto(`/groups/${slug}/activities/${activityId}`)
    const finished = row(page, tasks.finished)
    await expect(finished.getByText('Done', { exact: true })).toBeVisible()
    await finished.getByRole('button', { name: 'Reopen task' }).click()
    // The task is open again: the reopen control is gone and the badge says Open.
    await expect(finished.getByRole('button', { name: 'Reopen task' })).toHaveCount(0)
    await expect(finished.getByText('Open', { exact: true })).toBeVisible()
  })

  test('the header has one link each to Home, Groups, My tasks, Profile and Settings', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, fixtureUser('fresh'), baseURL ?? BASE)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/home')
    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    for (const [name, href] of [
      ['Home', '/home'],
      ['Groups', '/groups'],
      ['My tasks', '/tasks'],
      ['Profile', '/profile'],
      ['Settings', '/settings'],
    ] as const) {
      const link = nav.getByRole('link', { name: new RegExp(`^${name}`) })
      await expect(link).toHaveCount(1)
      await expect(link).toHaveAttribute('href', href)
    }
    // No Admin link for a member who is not an admin.
    await expect(page.getByRole('link', { name: /^Admin/ })).toHaveCount(0)
  })

  test('the profile feed shows work to a fellow group member and an admin, and not to others', async ({
    page,
    context,
    baseURL,
  }) => {
    // `fresh` shares the feed group with the owner.
    await loginAs(context, fixtureUser('fresh'), baseURL ?? BASE)
    await page.goto(`/people/${ownerId}`)
    const feed = page.getByRole('region', { name: FEED })
    await expect(feed.getByRole('link', { name: titles.feed, exact: true })).toBeVisible()
    await expect(feed.getByRole('link', { name: tasks.feed, exact: true })).toBeVisible()

    // An admin sees everything in a group they could open.
    await context.clearCookies()
    await loginAs(context, fixtureUser('admin'), baseURL ?? BASE)
    await page.goto(`/people/${ownerId}`)
    await expect(
      page
        .getByRole('region', { name: FEED })
        .getByRole('link', { name: titles.feed, exact: true }),
    ).toBeVisible()

    // `experienced` is in none of the owner's groups: the section shows nothing of them.
    await context.clearCookies()
    await loginAs(context, fixtureUser('experienced'), baseURL ?? BASE)
    await page.goto(`/people/${ownerId}`)
    const other = page.getByRole('region', { name: FEED })
    await expect(other.getByRole('heading', { name: FEED })).toBeVisible()
    await expect(other.getByText(titles.feed)).toHaveCount(0)
    await expect(other.getByText(tasks.feed)).toHaveCount(0)
  })
})
