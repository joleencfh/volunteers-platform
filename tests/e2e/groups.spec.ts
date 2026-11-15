// Working group list and pages of story W-02. Needs a local Supabase, so it runs in CI.
import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { fixtureUser, type FixtureUser } from '../fixtures/users'
import { adminClient, supabaseEnv } from '../helpers/supabase'
import { expectNoSeriousA11yViolations } from './helpers/a11y'
import { loginAs } from './helpers/auth'

test.skip(!supabaseEnv(), 'needs Supabase settings (runs in CI)')

const BASE = 'http://localhost:3000'
const SIGNAL = 'https://signal.group/#synthetic-example'

async function idOf(user: FixtureUser) {
  const { data, error } = await adminClient()
    .from('users')
    .select('id')
    .eq('email', user.email)
    .single()
  if (error) throw error
  return data.id as string
}

test.describe('working group pages', () => {
  const suffix = randomUUID().slice(0, 8)
  const slug = `e2e-group-${suffix}`
  const name = `E2E Group ${suffix}`
  const description = `Synthetic group ${suffix} for the page tests.`
  let groupId = ''

  test.beforeAll(async () => {
    const db = adminClient()
    const { data, error } = await db
      .from('working_groups')
      .insert({ slug, name, description, signal_url: SIGNAL })
      .select('id')
      .single()
    if (error) throw error
    groupId = data.id
    // The fixture user `fresh` is a member; `new` is not.
    const member = await db
      .from('wg_members')
      .insert({ group_id: groupId, user_id: await idOf(fixtureUser('fresh')) })
    if (member.error) throw member.error
  })

  test.afterAll(async () => {
    // Memberships go with the group (on delete cascade).
    await adminClient().from('working_groups').delete().eq('id', groupId)
  })

  test('a signed-out visitor is sent to the login page', async ({ page }) => {
    await page.goto('/groups')
    await expect(page).toHaveURL(/\/login/)
  })

  test('the list shows the group, with a Member marker only for its members', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, fixtureUser('fresh'), baseURL ?? BASE)
    await page.goto('/groups')
    const card = page.getByRole('listitem').filter({ hasText: name })
    await expect(card).toBeVisible()
    await expect(card.getByText(description)).toBeVisible()
    await expect(card.getByText('No lead this week')).toBeVisible()
    await expect(card.getByText('Member', { exact: true })).toBeVisible()
    await expectNoSeriousA11yViolations(page)

    const other = await context.browser()?.newContext()
    if (!other) throw new Error('no browser')
    const outsiderPage = await other.newPage()
    await loginAs(other, fixtureUser('new'), baseURL ?? BASE)
    await outsiderPage.goto(`${baseURL ?? BASE}/groups`)
    const outsiderCard = outsiderPage.getByRole('listitem').filter({ hasText: name })
    await expect(outsiderCard).toBeVisible()
    await expect(outsiderCard.getByText('Member', { exact: true })).toHaveCount(0)
    await other.close()
  })

  test('a non-member sees the limited view only', async ({ page, context, baseURL }) => {
    await loginAs(context, fixtureUser('new'), baseURL ?? BASE)
    await page.goto(`/groups/${slug}`)
    await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible()
    await expect(page.getByText(description)).toBeVisible()
    await expect(page.getByText('Details are for members')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Members', exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Signal group' })).toHaveCount(0)
    await expectNoSeriousA11yViolations(page)

    // Asking for a section does not open it for a non-member.
    await page.goto(`/groups/${slug}?tab=members`)
    await expect(page.getByText('Details are for members')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Members of this group' })).toHaveCount(0)
  })

  test('a member sees all five sections, the links and the member list', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, fixtureUser('fresh'), baseURL ?? BASE)
    await page.goto(`/groups/${slug}`)
    const sections = page.getByRole('navigation', { name: `Sections of ${name}` })
    for (const label of ['Overview', 'Activities', 'Tasks', 'Members', 'Meetings']) {
      await expect(sections.getByRole('link', { name: label, exact: true })).toBeVisible()
    }
    await expect(sections.getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(page.getByRole('link', { name: 'Signal group' })).toHaveAttribute('href', SIGNAL)
    await expectNoSeriousA11yViolations(page)

    await sections.getByRole('link', { name: 'Members', exact: true }).click()
    await expect(page).toHaveURL(/tab=members/)
    await expect(page.getByRole('heading', { name: 'Members of this group' })).toBeVisible()
    await expect(page.getByRole('listitem').filter({ hasText: /Level: Fresh/ })).toBeVisible()

    await page.goto(`/groups/${slug}?tab=meetings`)
    await expect(page.getByText('No meetings planned')).toBeVisible()
    await page.goto(`/groups/${slug}?tab=bogus`)
    await expect(page.getByRole('heading', { name: 'About this group' })).toBeVisible()
  })

  test('an admin who is not a member sees everything', async ({ page, context, baseURL }) => {
    await loginAs(context, fixtureUser('admin'), baseURL ?? BASE)
    await page.goto(`/groups/${slug}?tab=members`)
    await expect(page.getByRole('heading', { name: 'Members of this group' })).toBeVisible()
    await page.goto(`/groups/${slug}`)
    await expect(page.getByRole('link', { name: 'Signal group' })).toBeVisible()
  })

  test('an unknown or malformed slug shows the not-found screen', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, fixtureUser('fresh'), baseURL ?? BASE)
    await page.goto('/groups/no-such-group-here')
    await expect(page.getByText(/could not be found/i)).toBeVisible()
    await page.goto('/groups/Not_A_Slug')
    await expect(page.getByText(/could not be found/i)).toBeVisible()
  })
})
