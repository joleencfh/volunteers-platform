// Permission regression for milestone M3a (spec sections 3, 5 and 7): for every working group
// route, what a signed-out visitor, a non-member, each member level and an admin get, plus the
// limited view and the "same working group" profile tier. Needs a local Supabase, so it runs in CI.
import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { startOfIsoWeek } from '../../lib/domain/week'
import { fixtureUser, OUTSIDER, type FixtureUser } from '../fixtures/users'
import { adminClient, supabaseEnv } from '../helpers/supabase'
import { loginAs } from './helpers/auth'

test.skip(!supabaseEnv(), 'needs Supabase settings (runs in CI)')

const BASE = 'http://localhost:3000'
const RISKS = 'Synthetic risks text for the M3a permission test.'

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

test.describe('working group access and visibility', () => {
  // One test adds and removes a membership, and the profile test relies on who is a member.
  test.describe.configure({ mode: 'serial' })
  const suffix = randomUUID().slice(0, 8)
  const slug = `e2e-m3a-${suffix}`
  const name = `E2E M3a ${suffix}`
  const description = `Synthetic group ${suffix} for the permission test.`
  const SIGNAL = 'https://signal.group/#synthetic-m3a'
  let groupId = ''
  let leadName = ''
  let ownerId = ''
  let ownerName = ''

  test.beforeAll(async () => {
    const db = adminClient()
    const { data, error } = await db
      .from('working_groups')
      .insert({ slug, name, description, signal_url: SIGNAL })
      .select('id')
      .single()
    if (error) throw error
    groupId = data.id

    // `new`, `fresh` and a made-up owner are members. `experienced` and the admin are not, so the
    // non-member and admin-outside-the-group cases are covered too.
    const newcomer = await userOf(fixtureUser('new'))
    const fresh = await userOf(fixtureUser('fresh'))
    leadName = newcomer.display_name

    const email = `e2e-m3a-${suffix}@example.test`
    const created = await db.auth.admin.createUser({ email, email_confirm: true })
    if (created.error) throw created.error
    ownerId = created.data.user.id
    ownerName = `Owner ${suffix}`
    const owner = await db.from('users').insert({
      id: ownerId,
      display_name: ownerName,
      real_name: 'M3a Owner',
      email,
      ai_safety_knowledge: 'advanced',
      ai_risks: RISKS,
    })
    if (owner.error) throw owner.error

    const members = await db
      .from('wg_members')
      .insert([newcomer.id, fresh.id, ownerId].map((user_id) => ({ group_id: groupId, user_id })))
    if (members.error) throw members.error

    const lead = await db.from('wg_leads').insert({
      group_id: groupId,
      week_start: startOfIsoWeek(new Date()).toISOString().slice(0, 10),
      user_id: newcomer.id,
    })
    if (lead.error) throw lead.error
  })

  test.afterAll(async () => {
    const db = adminClient()
    // Memberships, leads and meetings go with the group (on delete cascade).
    await db.from('working_groups').delete().eq('id', groupId)
    if (ownerId) await db.auth.admin.deleteUser(ownerId)
  })

  const routes = () => [
    { path: '/groups', admin: false },
    { path: `/groups/${slug}`, admin: false },
    { path: '/admin/groups', admin: true },
    { path: '/admin/groups/new', admin: true },
    { path: `/admin/groups/${groupId}`, admin: true },
  ]

  test('a signed-out visitor is sent to /login from every route', async ({ page }) => {
    for (const route of routes()) {
      expect(await outcome(page, route.path), route.path).toBe('login')
    }
  })

  test('a non-member with an account is refused everywhere', async ({ page, context, baseURL }) => {
    await loginAs(context, OUTSIDER, baseURL ?? BASE)
    for (const route of routes()) {
      expect(await outcome(page, route.path), route.path).toBe('refused')
    }
  })

  test('a member sees group routes and gets a 404 on admin routes', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, fixtureUser('new'), baseURL ?? BASE)
    for (const route of routes()) {
      const expected: Outcome = route.admin ? 'notFound' : 'page'
      expect(await outcome(page, route.path), route.path).toBe(expected)
    }
  })

  test('an admin sees every route', async ({ page, context, baseURL }) => {
    await loginAs(context, fixtureUser('admin'), baseURL ?? BASE)
    for (const route of routes()) {
      expect(await outcome(page, route.path), route.path).toBe('page')
    }
  })

  test('a non-member sees name, description and lead, and nothing else', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, fixtureUser('experienced'), baseURL ?? BASE)
    await page.goto(`/groups/${slug}`)
    await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible()
    await expect(page.getByText(description)).toBeVisible()
    await expect(page.getByText(`Lead this week: ${leadName}`)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Details are for members' })).toBeVisible()
    // No tabs (members, meetings), no links and no forms of the group.
    await expect(page.getByRole('link', { name: 'Members', exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Meetings', exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Signal group' })).toHaveCount(0)
    await expect(page.locator(`a[href="${SIGNAL}"]`)).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Assign the lead' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Join requests' })).toHaveCount(0)
    await expect(page.getByText(ownerName)).toHaveCount(0)

    // Asking for the member list or the meetings through the tab parameter gives nothing either.
    await page.goto(`/groups/${slug}?tab=members`)
    await expect(page.getByRole('heading', { name: 'Details are for members' })).toBeVisible()
    await expect(page.getByText(ownerName)).toHaveCount(0)
    await page.goto(`/groups/${slug}?tab=meetings`)
    await expect(page.getByRole('heading', { name: 'Details are for members' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Add a meeting' })).toHaveCount(0)
  })

  test('a new member sees the full page but no approval, lead or meeting forms', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, fixtureUser('new'), baseURL ?? BASE)
    await page.goto(`/groups/${slug}`)
    await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Signal group' })).toHaveAttribute('href', SIGNAL)
    await expect(page.getByRole('heading', { name: 'Join requests' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Assign the lead' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Change the links' })).toHaveCount(0)
    await page.goto(`/groups/${slug}?tab=meetings`)
    await expect(page.getByText('No meetings planned')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Add a meeting' })).toHaveCount(0)
  })

  test('a fresh member approves joins and edits meetings but cannot assign leads', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, fixtureUser('fresh'), baseURL ?? BASE)
    await page.goto(`/groups/${slug}`)
    await expect(page.getByRole('heading', { name: 'Join requests' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Change the links' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Assign the lead' })).toHaveCount(0)
    await page.goto(`/groups/${slug}?tab=meetings`)
    await expect(page.getByRole('region', { name: 'Add a meeting' })).toBeVisible()
  })

  test('an experienced member of the group assigns leads', async ({ page, context, baseURL }) => {
    const experienced = await userOf(fixtureUser('experienced'))
    const added = await adminClient()
      .from('wg_members')
      .insert({ group_id: groupId, user_id: experienced.id })
    if (added.error) throw added.error
    try {
      await loginAs(context, fixtureUser('experienced'), baseURL ?? BASE)
      await page.goto(`/groups/${slug}`)
      await expect(page.getByRole('heading', { name: 'Assign the lead' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Join requests' })).toBeVisible()
    } finally {
      await adminClient()
        .from('wg_members')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', experienced.id)
    }
  })

  test('an admin outside the group sees the full page with every form', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, fixtureUser('admin'), baseURL ?? BASE)
    await page.goto(`/groups/${slug}`)
    await expect(page.getByRole('heading', { name: 'Join requests' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Assign the lead' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Change the links' })).toBeVisible()
  })

  test('the "same working group" profile tier shows knowledge and risks to a co-member only', async ({
    page,
    context,
    baseURL,
  }) => {
    // `fresh` shares the group with the owner; `experienced` does not (at this point).
    await loginAs(context, fixtureUser('fresh'), baseURL ?? BASE)
    await page.goto(`/people/${ownerId}`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(ownerName)
    await expect(page.getByText('AI safety knowledge level')).toBeVisible()
    await expect(page.getByText('I know it very well')).toBeVisible()
    await expect(page.getByText(RISKS)).toBeVisible()

    await context.clearCookies()
    await loginAs(context, fixtureUser('experienced'), baseURL ?? BASE)
    await page.goto(`/people/${ownerId}`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(ownerName)
    await expect(page.getByText('AI safety knowledge level')).toHaveCount(0)
    await expect(page.getByText(RISKS)).toHaveCount(0)
  })
})
