// Activity list, create form and detail page of story T-03 (part 1). Needs a local Supabase, so it
// runs in CI. Assertions check the resulting state, not transient messages.
import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { fixtureUser, type FixtureUser } from '../fixtures/users'
import { adminClient, supabaseEnv } from '../helpers/supabase'
import { expectNoSeriousA11yViolations } from './helpers/a11y'
import { loginAs } from './helpers/auth'

test.skip(!supabaseEnv(), 'needs Supabase settings (runs in CI)')

async function idOf(user: FixtureUser) {
  const { data, error } = await adminClient()
    .from('users')
    .select('id')
    .eq('email', user.email)
    .single()
  if (error) throw error
  return data.id as string
}

test.describe('activities: list, create and detail', () => {
  const suffix = randomUUID().slice(0, 8)
  const slug = `e2e-activities-${suffix}`
  const name = `E2E Activities ${suffix}`
  const seededTitle = `Seeded activity ${suffix}`
  const createdTitle = `Letter campaign ${suffix}`
  const message = `Please support the treaty ${suffix}`
  let groupId = ''

  test.beforeAll(async () => {
    const db = adminClient()
    const group = await db
      .from('working_groups')
      .insert({ slug, name, description: `Synthetic group ${suffix} for the activity tests.` })
      .select('id')
      .single()
    if (group.error) throw group.error
    groupId = group.data.id
    // `fresh` and `new` are members; `experienced` is not. The General activity comes from the database.
    for (const key of ['fresh', 'new'] as const) {
      const member = await db
        .from('wg_members')
        .insert({ group_id: groupId, user_id: await idOf(fixtureUser(key)) })
      if (member.error) throw member.error
    }
    const seeded = await db.from('activities').insert({
      group_id: groupId,
      type: 'campaign',
      title: seededTitle,
      status: 'active',
      details: { message: 'Seeded message' },
    })
    if (seeded.error) throw seeded.error
  })

  test.afterAll(async () => {
    // Activities, participants and memberships go with the group (on delete cascade).
    await adminClient().from('working_groups').delete().eq('id', groupId)
  })

  test('a fresh member creates a campaign and sees it in the list and on the detail page', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, fixtureUser('fresh'), baseURL ?? 'http://localhost:3000')

    await page.goto(`/groups/${slug}?tab=activities`)
    await expect(page.getByRole('link', { name: seededTitle })).toBeVisible()
    await expect(page.getByRole('link', { name: 'General', exact: true })).toBeVisible()
    await expectNoSeriousA11yViolations(page)

    await page.getByRole('link', { name: 'New activity', exact: true }).click()
    await page.waitForURL(/\/activities\/new$/)
    await expect(page.getByRole('heading', { name: 'New activity', level: 1 })).toBeVisible()
    await page.getByRole('link', { name: /^Campaign/ }).click()
    await page.waitForURL(/type=campaign/)
    // The campaign's own fields are rendered from its definition.
    await expect(page.getByLabel('Message content or link')).toBeVisible()
    await expect(page.getByLabel('Targets contacted')).toBeVisible()
    await expectNoSeriousA11yViolations(page)

    await page.getByLabel(/^Title/).fill(createdTitle)
    await page.getByLabel('Message content or link').fill(message)
    await page.getByRole('button', { name: 'Create activity' }).click()

    await page.waitForURL(/\/activities\/[0-9a-f-]{36}$/)
    await expect(page.getByRole('heading', { name: createdTitle, level: 1 })).toBeVisible()
    await expect(page.getByText(message)).toBeVisible()
    // The creator is a participant.
    await expect(page.getByRole('heading', { name: 'Participants' })).toBeVisible()
    await expect(page.getByText('Participant', { exact: true })).toBeVisible()
    await expectNoSeriousA11yViolations(page)

    await page.getByRole('link', { name: /Back to activities/ }).click()
    await page.waitForURL(/tab=activities/)
    await expect(page.getByRole('link', { name: createdTitle })).toBeVisible()
  })

  test('a new volunteer sees the list but no create button, and not-found on the form', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, fixtureUser('new'), baseURL ?? 'http://localhost:3000')

    await page.goto(`/groups/${slug}?tab=activities`)
    await expect(page.getByRole('link', { name: seededTitle })).toBeVisible()
    await expect(page.getByRole('link', { name: 'New activity', exact: true })).toHaveCount(0)

    await page.goto(`/groups/${slug}/activities/new`)
    await expect(page.getByText(/could not be found/i)).toBeVisible()
  })

  test('a non-member sees titles and statuses only', async ({ page, context, baseURL }) => {
    await loginAs(context, fixtureUser('experienced'), baseURL ?? 'http://localhost:3000')

    await page.goto(`/groups/${slug}`)
    await expect(page.getByText(seededTitle)).toBeVisible()
    // Two activities are active here (the seeded one and the automatic General one): one is enough.
    await expect(page.getByText('Active', { exact: true }).first()).toBeVisible()
    // No message, no links into the activity, no tabs.
    await expect(page.getByText('Seeded message')).toHaveCount(0)
    await expect(page.getByRole('link', { name: seededTitle })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Activities', exact: true })).toHaveCount(0)
    await expectNoSeriousA11yViolations(page)

    await page.goto(`/groups/${slug}/activities/new`)
    await expect(page.getByText(/could not be found/i)).toBeVisible()
  })
})
