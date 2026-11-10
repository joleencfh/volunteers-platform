// Settings of story P-03 (part 1): language preference and sign out. Needs a local Supabase,
// so it runs in CI. The fixture members' language is restored after each test.
import { expect, test } from '@playwright/test'
import { fixtureUser } from '../fixtures/users'
import { adminClient, supabaseEnv } from '../helpers/supabase'
import { expectNoSeriousA11yViolations } from './helpers/a11y'
import { loginAs } from './helpers/auth'

const BASE = 'http://localhost:3000'

test('a signed-out visitor is sent to the login page from /settings', async ({ page }) => {
  await page.goto('/settings')
  await expect(page).toHaveURL(/\/login$/)
})

test.describe('with a member', () => {
  test.skip(!supabaseEnv(), 'needs Supabase settings (runs in CI)')
  // Uses a fixture member whose language the tests change.
  test.describe.configure({ mode: 'serial' })

  const member = fixtureUser('experienced')

  test.beforeEach(async ({ context }) => {
    // The welcome window opens by itself on /home; "Later" keeps it closed (see home.spec.ts).
    await context.addInitScript(() => {
      window.sessionStorage.setItem('onboarding-window-later:read_welcome_document', '1')
    })
  })

  test.afterEach(async () => {
    await adminClient().from('users').update({ locale: 'en' }).eq('email', member.email)
  })

  test('switching to Italian changes the language and persists across a reload', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, member, baseURL ?? BASE)
    await page.goto('/settings')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')

    await page.getByLabel('Interface language').selectOption('it')
    await page.getByRole('button', { name: 'Save language' }).click()

    await expect(page.locator('html')).toHaveAttribute('lang', 'it')
    await expect(page.getByRole('heading', { name: 'Impostazioni', level: 1 })).toBeVisible()

    await page.goto('/home')
    await expect(page.locator('html')).toHaveAttribute('lang', 'it')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('lang', 'it')

    const { data } = await adminClient()
      .from('users')
      .select('locale')
      .eq('email', member.email)
      .single()
    expect(data?.locale).toBe('it')
  })

  test('the legal pages stay Italian whichever language is chosen', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, member, baseURL ?? BASE)
    for (const locale of ['en', 'it']) {
      await adminClient().from('users').update({ locale }).eq('email', member.email)
      await page.goto('/settings')
      await page.getByLabel(/Interface language|Lingua dell’interfaccia/).selectOption(locale)
      await page.getByRole('button', { name: /Save language|Salva la lingua/ }).click()
      await expect(page.locator('html')).toHaveAttribute('lang', locale)
      await page.goto('/privacy')
      await expect(page.locator('html')).toHaveAttribute('lang', 'it')
    }
  })

  test('signing out lands on /login and closes /home', async ({ page, context, baseURL }) => {
    await loginAs(context, member, baseURL ?? BASE)
    await page.goto('/settings')
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login$/)
    await page.goto('/home')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('settings has no serious accessibility violations', async ({ page, context, baseURL }) => {
    await loginAs(context, member, baseURL ?? BASE)
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()
    await expectNoSeriousA11yViolations(page)
  })
})
