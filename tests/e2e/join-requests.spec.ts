// Join requests of story W-03. Needs a local Supabase, so it runs in CI.
import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { fixtureUser, type FixtureUser } from '../fixtures/users'
import { adminClient, supabaseEnv } from '../helpers/supabase'
import { expectNoSeriousA11yViolations } from './helpers/a11y'
import { loginAs } from './helpers/auth'

test.skip(!supabaseEnv(), 'needs Supabase settings (runs in CI)')

const BASE = 'http://localhost:3000'

async function idOf(user: FixtureUser) {
  const { data, error } = await adminClient()
    .from('users')
    .select('id')
    .eq('email', user.email)
    .single()
  if (error) throw error
  return data.id as string
}

// One story told in order: the `new` volunteer asks, the `fresh` member approves, and the
// `experienced` volunteer's pending request shows who may and may not decide.
test.describe.serial('join requests', () => {
  const suffix = randomUUID().slice(0, 8)
  const slug = `e2e-join-${suffix}`
  const name = `E2E Join ${suffix}`
  let groupId = ''

  test.beforeAll(async () => {
    const db = adminClient()
    const { data, error } = await db
      .from('working_groups')
      .insert({ slug, name, description: `Synthetic group ${suffix} for join requests.` })
      .select('id')
      .single()
    if (error) throw error
    groupId = data.id
    const member = await db
      .from('wg_members')
      .insert({ group_id: groupId, user_id: await idOf(fixtureUser('fresh')) })
    if (member.error) throw member.error
  })

  test.afterAll(async () => {
    // Memberships and requests go with the group (on delete cascade).
    await adminClient().from('working_groups').delete().eq('id', groupId)
  })

  test('a new volunteer requests to join and sees the request pending', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, fixtureUser('new'), baseURL ?? BASE)
    await page.goto(`/groups/${slug}`)
    await page.getByRole('button', { name: 'Request to join' }).click()
    // The action revalidates the page, so the server replaces the button and its short-lived
    // "Request sent." message with the pending state: assert that final state, not the message.
    await expect(page.getByText('Request pending', { exact: true })).toBeVisible()

    await page.reload()
    await expect(page.getByText('Request pending', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Request to join' })).toHaveCount(0)
    await expectNoSeriousA11yViolations(page)
  })

  test('a fresh member of the group approves, and the requester becomes a member', async ({
    page,
    browser,
    context,
    baseURL,
  }) => {
    await loginAs(context, fixtureUser('fresh'), baseURL ?? BASE)
    await page.goto(`/groups/${slug}`)
    await expect(page.getByRole('heading', { name: 'Join requests' })).toBeVisible()
    await expect(page.getByRole('link', { name: /^Groups/ })).toBeVisible()
    await expectNoSeriousA11yViolations(page)

    const card = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('button', { name: /^Approve/ }) })
    await card.getByRole('button', { name: /^Approve/ }).click()
    // The action revalidates the page, so the decided request leaves the list together with its
    // short-lived message: assert the resulting state, not the message.
    await expect(page.getByText('No pending requests.')).toBeVisible()

    const requesterContext = await browser.newContext()
    const requesterPage = await requesterContext.newPage()
    await loginAs(requesterContext, fixtureUser('new'), baseURL ?? BASE)
    await requesterPage.goto(`${baseURL ?? BASE}/groups/${slug}`)
    const sections = requesterPage.getByRole('navigation', { name: `Sections of ${name}` })
    await expect(sections.getByRole('link', { name: 'Members', exact: true })).toBeVisible()
    await expect(requesterPage.getByRole('button', { name: 'Request to join' })).toHaveCount(0)
    await requesterContext.close()
  })

  test('a new member of the group sees no approval controls', async ({
    page,
    context,
    baseURL,
  }) => {
    // The `experienced` volunteer asks; `new` is a member now but may not decide.
    const asked = await adminClient()
      .from('wg_join_requests')
      .insert({ group_id: groupId, user_id: await idOf(fixtureUser('experienced')) })
    if (asked.error) throw asked.error

    await loginAs(context, fixtureUser('new'), baseURL ?? BASE)
    await page.goto(`/groups/${slug}`)
    await expect(page.getByRole('heading', { name: 'About this group' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Join requests' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Approve/ })).toHaveCount(0)
  })
})
