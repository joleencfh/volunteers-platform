// The profile journey of story P-02 (spec section 7). Needs a local Supabase, so it runs in CI.
import { expect, test } from '@playwright/test'
import { fixtureUser, type FixtureUser } from '../fixtures/users'
import { adminClient, supabaseEnv } from '../helpers/supabase'
import { expectNoSeriousA11yViolations } from './helpers/a11y'
import { loginAs } from './helpers/auth'

const BASE = 'http://localhost:3000'

test('a signed-out visitor is sent to the login page', async ({ page }) => {
  await page.goto('/profile')
  await expect(page).toHaveURL(/\/login/)
  await page.goto('/people/8b1c2f3e-4d5a-4b6c-8d7e-9f0a1b2c3d4e')
  await expect(page).toHaveURL(/\/login/)
})

test.describe('with members', () => {
  test.skip(!supabaseEnv(), 'needs Supabase settings (runs in CI)')
  // The fixture members are shared and the tests change one of them.
  test.describe.configure({ mode: 'serial' })

  const owner = fixtureUser('fresh')
  const viewer = fixtureUser('experienced')
  const admin = fixtureUser('admin')
  const CITY = 'Testville'
  const BIO = 'Synthetic bio for the profile test.'
  const LINKEDIN = 'https://www.linkedin.com/in/synthetic-example'

  async function idOf(user: FixtureUser) {
    const { data, error } = await adminClient()
      .from('users')
      .select('id')
      .eq('email', user.email)
      .single()
    if (error) throw error
    return data.id as string
  }

  test.beforeAll(async () => {
    // Start from a blank profile with default visibility.
    const db = adminClient()
    const id = await idOf(owner)
    await db
      .from('users')
      .update({
        city: null,
        bio: null,
        linkedin_url: null,
        ai_safety_knowledge: null,
        ai_risks: null,
      })
      .eq('id', id)
    await db.from('profile_visibility').delete().eq('user_id', id)
  })

  test('the owner edits their profile and visibility', async ({ page, context, baseURL }) => {
    await loginAs(context, owner, baseURL ?? BASE)
    await page.goto('/profile')
    await expect(page.getByRole('heading', { level: 1, name: 'My profile' })).toBeVisible()
    await expectNoSeriousA11yViolations(page)

    await page.getByLabel('City or region').fill(CITY)
    await page.getByLabel('About you').fill(BIO)
    await page.getByLabel('LinkedIn profile').fill(LINKEDIN)
    await page.getByLabel('AI safety knowledge level').selectOption('basic')
    await page.getByRole('button', { name: 'Save profile' }).click()
    await expect(page.getByText('Profile saved.')).toBeVisible()

    // Defaults: city admin only, bio all members.
    await page.reload()
    await expect(page.getByLabel('City or region')).toHaveValue(CITY)
    await expect(page.locator('#visibility-city')).toHaveValue('admin')
    await expect(page.locator('#visibility-bio')).toHaveValue('members')
    // Fixed fields are shown as information, not as inputs.
    await expect(page.getByText(owner.email)).toBeVisible()
    await expect(page.getByLabel('Email')).toHaveCount(0)
  })

  test('a link that is not https is refused', async ({ page, context, baseURL }) => {
    await loginAs(context, owner, baseURL ?? BASE)
    await page.goto('/profile')
    await page.getByLabel('LinkedIn profile').fill('http://example.test/in/someone')
    await page.getByRole('button', { name: 'Save profile' }).click()
    await expect(page.getByText('Enter a link that starts with https://')).toBeVisible()
  })

  test('another member sees only the all-members fields and the level', async ({
    page,
    context,
    baseURL,
  }) => {
    const id = await idOf(owner)
    await loginAs(context, viewer, baseURL ?? BASE)
    await page.goto(`/people/${id}`)
    await expect(page.getByText(BIO)).toBeVisible()
    await expect(page.getByText('Level: Fresh')).toBeVisible()
    await expect(page.getByText(CITY)).toHaveCount(0)
    await expect(page.getByText(LINKEDIN)).toHaveCount(0)
    await expect(page.getByText(owner.email)).toHaveCount(0)
    await expectNoSeriousA11yViolations(page)
  })

  test('widening the city to all members makes it appear', async ({ page, context, baseURL }) => {
    const id = await idOf(owner)
    await loginAs(context, owner, baseURL ?? BASE)
    await page.goto('/profile')
    await page.locator('#visibility-city').selectOption('members')
    await page.getByRole('button', { name: 'Save profile' }).click()
    await expect(page.getByText('Profile saved.')).toBeVisible()

    const other = await context.browser()!.newContext()
    const otherPage = await other.newPage()
    await loginAs(other, viewer, baseURL ?? BASE)
    await otherPage.goto(`${baseURL ?? BASE}/people/${id}`)
    await expect(otherPage.getByText(CITY)).toBeVisible()
    await expect(otherPage.getByText(LINKEDIN)).toHaveCount(0)
    await other.close()
  })

  test('an admin sees the whole profile, fixed fields included', async ({
    page,
    context,
    baseURL,
  }) => {
    const id = await idOf(owner)
    await loginAs(context, admin, baseURL ?? BASE)
    await page.goto(`/people/${id}`)
    await expect(page.getByText(CITY)).toBeVisible()
    await expect(page.getByText(LINKEDIN)).toBeVisible()
    await expect(page.getByText(owner.email)).toBeVisible()
    await expect(page.getByText('Joined on')).toBeVisible()
  })

  test('an id that is not a member is a 404', async ({ page, context, baseURL }) => {
    await loginAs(context, viewer, baseURL ?? BASE)
    const response = await page.goto('/people/8b1c2f3e-4d5a-4b6c-8d7e-9f0a1b2c3d4e')
    expect(response?.status()).toBe(404)
  })
})
