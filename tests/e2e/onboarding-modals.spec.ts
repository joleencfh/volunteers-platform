// The read-and-confirm windows of story O-02 (part 2): welcome document and current activities.
// Needs a local Supabase, so it runs in CI. The config value is changed through the service role
// of the local test database (tests refuse any other target) and restored afterwards.
import { expect, test, type Page } from '@playwright/test'
import { fixtureUser } from '../fixtures/users'
import { adminClient, supabaseEnv } from '../helpers/supabase'
import { expectNoSeriousA11yViolations } from './helpers/a11y'
import { loginAs } from './helpers/auth'

const BASE = 'http://localhost:3000'
const WELCOME_KEY = 'onboarding.welcome_document_url'
const WELCOME_URL = 'https://example.org/welcome-test'
const WELCOME_TITLE = 'Read the welcome document'
const ACTIVITIES_TITLE = 'Looked at current activities'

test.describe('onboarding windows', () => {
  test.skip(!supabaseEnv(), 'needs Supabase settings (runs in CI)')
  // The tests change the admin fixture's progress (no other spec uses it for onboarding, so specs
  // can run in parallel) and a shared setting.
  test.describe.configure({ mode: 'serial' })

  let previousUrl: unknown = ''

  test.beforeAll(async () => {
    const db = adminClient()
    const { data } = await db.from('config').select('value').eq('key', WELCOME_KEY).single()
    previousUrl = data?.value ?? ''
    const { error } = await db.from('config').update({ value: WELCOME_URL }).eq('key', WELCOME_KEY)
    if (error) throw error
  })

  test.afterAll(async () => {
    await adminClient().from('config').update({ value: previousUrl }).eq('key', WELCOME_KEY)
  })

  async function idOf(email: string) {
    const { data, error } = await adminClient()
      .from('users')
      .select('id')
      .eq('email', email)
      .single()
    if (error) throw error
    return data.id as string
  }

  /** Forgets the member's progress on the two windowed steps, so each test starts open. */
  async function resetWindowSteps(email: string) {
    const db = adminClient()
    const id = await idOf(email)
    const { data: steps } = await db
      .from('onboarding_steps')
      .select('id')
      .in('key', ['read_welcome_document', 'looked_at_activities'])
    await db
      .from('user_onboarding')
      .delete()
      .eq('user_id', id)
      .in(
        'step_id',
        (steps ?? []).map((step) => step.id),
      )
  }

  const row = (page: Page, title: string) => page.getByRole('listitem').filter({ hasText: title })
  const dialog = (page: Page) => page.getByRole('dialog')
  const progress = (page: Page) => page.getByText(/^\d+ of \d+ steps done$/)
  const openButton = (page: Page, title: string) =>
    row(page, title).getByRole('button', { name: /^Open/ })

  test('the welcome window opens by itself, links to the document and "I\'ve read it" completes the step', async ({
    page,
    context,
    baseURL,
  }) => {
    const user = fixtureUser('admin')
    await resetWindowSteps(user.email)
    await loginAs(context, user, baseURL ?? BASE)
    await page.goto('/home')

    const window = dialog(page)
    await expect(window).toBeVisible()
    await expect(window.getByRole('heading', { name: WELCOME_TITLE })).toBeVisible()
    const link = window.getByRole('link', { name: /Open the welcome document/ })
    await expect(link).toHaveAttribute('href', WELCOME_URL)
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', /noopener/)
    await expect(link).toHaveAttribute('rel', /noreferrer/)
    await expectNoSeriousA11yViolations(page)

    await expect(progress(page)).toHaveText('1 of 8 steps done')
    await window.getByRole('button', { name: "I've read it" }).click()
    await expect(window).toBeHidden()
    await expect(page.getByRole('status').filter({ hasText: 'Step marked as done.' })).toBeVisible()
    await expect(row(page, WELCOME_TITLE).getByText('Done')).toBeVisible()
    await expect(progress(page)).toHaveText('2 of 8 steps done')

    // The window does not open again once the step is done.
    await page.reload()
    await expect(dialog(page)).toHaveCount(0)
    await expect(openButton(page, WELCOME_TITLE)).toHaveCount(0)
  })

  test('"Later" closes the window, leaves the step open and stops it opening again in this session', async ({
    page,
    context,
    baseURL,
  }) => {
    const user = fixtureUser('admin')
    await resetWindowSteps(user.email)
    await loginAs(context, user, baseURL ?? BASE)
    await page.goto('/home')

    await expect(dialog(page)).toBeVisible()
    const before = await progress(page).innerText()
    await dialog(page).getByRole('button', { name: 'Later' }).click()
    await expect(dialog(page)).toBeHidden()
    await expect(row(page, WELCOME_TITLE).getByText('Open', { exact: true })).toBeVisible()
    await expect(progress(page)).toHaveText(before)

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Your onboarding checklist' })).toBeVisible()
    await expect(dialog(page)).toHaveCount(0)

    // The row's Open button still opens it.
    await openButton(page, WELCOME_TITLE).click()
    await expect(dialog(page)).toBeVisible()
  })

  test('"Close" closes the window and leaves the step and the checklist unchanged', async ({
    page,
    context,
    baseURL,
  }) => {
    const user = fixtureUser('admin')
    await resetWindowSteps(user.email)
    await loginAs(context, user, baseURL ?? BASE)
    await page.goto('/home')

    await expect(dialog(page)).toBeVisible()
    const before = await progress(page).innerText()
    await dialog(page).getByRole('button', { name: 'Close', exact: true }).click()
    await expect(dialog(page)).toBeHidden()
    await expect(row(page, WELCOME_TITLE).getByText('Open', { exact: true })).toBeVisible()
    await expect(progress(page)).toHaveText(before)

    // Escape closes it as well, and the focus goes back to the button that opened it.
    const open = openButton(page, WELCOME_TITLE)
    await open.click()
    await expect(dialog(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toBeHidden()
    await expect(open).toBeFocused()
    await expect(progress(page)).toHaveText(before)
  })

  test('the activities window shows the empty state and "I\'ve read it" completes step 4', async ({
    page,
    context,
    baseURL,
  }) => {
    const user = fixtureUser('admin')
    await resetWindowSteps(user.email)
    await loginAs(context, user, baseURL ?? BASE)
    await page.goto('/home')

    // Step 3 is open, so its window opens first; step 4's never opens by itself.
    await expect(dialog(page)).toBeVisible()
    await expect(dialog(page).getByRole('heading', { name: WELCOME_TITLE })).toBeVisible()
    await dialog(page).getByRole('button', { name: 'Later' }).click()
    await expect(dialog(page)).toBeHidden()

    const before = await progress(page).innerText()
    await openButton(page, ACTIVITIES_TITLE).click()
    const window = dialog(page)
    await expect(window.getByRole('heading', { name: ACTIVITIES_TITLE })).toBeVisible()
    await expect(window.getByText('There are no current activities yet.')).toBeVisible()
    await expectNoSeriousA11yViolations(page)

    await window.getByRole('button', { name: "I've read it" }).click()
    await expect(window).toBeHidden()
    await expect(row(page, ACTIVITIES_TITLE).getByText('Done')).toBeVisible()
    const count = (text: string) => Number(/^(\d+) of/.exec(text)?.[1])
    await expect(progress(page)).not.toHaveText(before)
    expect(count(await progress(page).innerText())).toBe(count(before) + 1)
    // Step 3 stayed open.
    await expect(row(page, WELCOME_TITLE).getByText('Open', { exact: true })).toBeVisible()
  })
})
