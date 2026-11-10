// The three sign-in journeys of story A-02. They need a local Supabase, so they run in CI.
import { expect, test } from '@playwright/test'
import { fixtureUser, OUTSIDER } from '../fixtures/users'
import { adminClient, supabaseEnv } from '../helpers/supabase'
import { loginAs } from './helpers/auth'
import { requestMagicLink } from './helpers/magic-link'

test.skip(!supabaseEnv(), 'needs Supabase settings (runs in CI)')

const BASE = 'http://localhost:3000'

test('an approved member signs in with a magic link', async ({ page, context, baseURL }) => {
  const member = fixtureUser('experienced')
  const link = await requestMagicLink(context, member.email, baseURL ?? BASE)

  await page.goto(link)
  await expect(page).toHaveURL(`${baseURL ?? BASE}/home`)

  // The session is live: /login bounces a signed-in person to /home.
  await page.goto('/login')
  await expect(page).toHaveURL(`${baseURL ?? BASE}/home`)

  const { data } = await adminClient()
    .from('users')
    .select('last_login_at')
    .eq('email', member.email)
    .single()
  expect(data?.last_login_at).not.toBeNull()
})

test('someone without a member record is refused and signed out', async ({
  page,
  context,
  baseURL,
}) => {
  const link = await requestMagicLink(context, OUTSIDER.email, baseURL ?? BASE)

  await page.goto(link)
  await expect(page).toHaveURL(/\/login\?error=signin$/)
  // The page also has an empty field-error alert and Next.js's route announcer.
  await expect(
    page.getByRole('alert').filter({ hasText: 'We could not sign you in' }),
  ).toBeVisible()

  // Signed out: a protected route sends them back to the login page.
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/login$/)
})

test('a non-admin is refused on an admin route, an admin is let in', async ({
  page,
  context,
  baseURL,
}) => {
  await loginAs(context, fixtureUser('fresh'), baseURL ?? BASE)
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Admin' })).toHaveCount(0)
  await expect(page.getByText(/could not be found/i)).toBeVisible()

  const admin = await context.browser()?.newContext()
  if (!admin) throw new Error('no browser')
  await loginAs(admin, fixtureUser('admin'), baseURL ?? BASE)
  const adminPage = await admin.newPage()
  await adminPage.goto(`${baseURL ?? BASE}/admin`)
  await expect(adminPage.getByRole('heading', { name: 'Admin' })).toBeVisible()
  await admin.close()
})

test('a logged-out visitor is sent to the login page from an admin route', async ({ page }) => {
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})
