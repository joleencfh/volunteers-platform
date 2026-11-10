// The signed-in home of story O-02 (part 1): onboarding checklist and profile prompt.
// Needs a local Supabase, so it runs in CI.
import { expect, test } from '@playwright/test'
import { fixtureUser } from '../fixtures/users'
import { adminClient, supabaseEnv } from '../helpers/supabase'
import { expectNoSeriousA11yViolations } from './helpers/a11y'
import { loginAs } from './helpers/auth'

const BASE = 'http://localhost:3000'

test('a signed-out visitor is sent to the login page from /home', async ({ page }) => {
  await page.goto('/home')
  await expect(page).toHaveURL(/\/login$/)
})

test.describe('with members', () => {
  test.skip(!supabaseEnv(), 'needs Supabase settings (runs in CI)')
  // The tests change the fixture members' profile and progress.
  test.describe.configure({ mode: 'serial' })

  // The welcome window opens by itself on first login and would cover the page these tests
  // work with; choosing "Later" in the session switches that off (tests/e2e/onboarding-modals.spec.ts
  // covers the window itself).
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      window.sessionStorage.setItem('onboarding-window-later:read_welcome_document', '1')
    })
  })

  const STEP_TITLES = [
    'Added to the platform',
    'Added to the Signal group',
    'Read the welcome document',
    'Looked at current activities',
    'Joined one working group',
    'Took part in the first group call',
    'Joined or contributed to a first activity',
    'One-on-one check-in of 15–20 minutes',
  ]

  async function idOf(email: string) {
    const { data, error } = await adminClient()
      .from('users')
      .select('id')
      .eq('email', email)
      .single()
    if (error) throw error
    return data.id as string
  }

  test('a signed-in member who visits / lands on /home and sees the checklist', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, fixtureUser('new'), baseURL ?? BASE)
    await page.goto('/')
    await expect(page).toHaveURL(`${baseURL ?? BASE}/home`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome')

    const list = page.getByRole('list').filter({ hasText: STEP_TITLES[0] })
    for (const title of STEP_TITLES) await expect(list.getByText(title)).toBeVisible()
    // Step 1 is done by the database trigger; the others are open.
    const first = list.getByRole('listitem').filter({ hasText: STEP_TITLES[0] })
    await expect(first.getByText('Done')).toBeVisible()
    await expect(first.getByText('Completed automatically')).toBeVisible()
    const signal = list.getByRole('listitem').filter({ hasText: STEP_TITLES[1] })
    await expect(signal.getByText('Open')).toBeVisible()
    await expect(signal.getByText('An admin confirms this step')).toBeVisible()
    // A member cannot complete an admin step: there is no control for it (the database refuses
    // it too, see tests/db/onboarding-rls.test.ts).
    await expect(signal.getByRole('button')).toHaveCount(0)

    await expect(page.getByText(/^1 of \d+ steps done$/)).toBeVisible()
    await expect(page.getByRole('progressbar', { name: 'Onboarding progress' })).toHaveAttribute(
      'value',
      '1',
    )
    await expectNoSeriousA11yViolations(page)
  })

  test('the signed-in member is bounced from /login to /home and /home is in the nav', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, fixtureUser('new'), baseURL ?? BASE)
    await page.goto('/login')
    await expect(page).toHaveURL(`${baseURL ?? BASE}/home`)
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toContainText('Home')
  })

  test('the profile prompt shows until city and bio are filled in', async ({
    page,
    context,
    baseURL,
  }) => {
    const user = fixtureUser('new')
    const db = adminClient()
    const id = await idOf(user.email)
    try {
      await db.from('users').update({ city: null, bio: null }).eq('id', id)
      await loginAs(context, user, baseURL ?? BASE)
      await page.goto('/home')
      const prompt = page.getByRole('heading', { name: 'Complete your profile' })
      await expect(prompt).toBeVisible()
      await page.getByRole('link', { name: 'Go to my profile' }).click()
      await expect(page).toHaveURL(/\/profile$/)

      await db.from('users').update({ city: 'Testville', bio: 'Synthetic bio.' }).eq('id', id)
      await page.goto('/home')
      await expect(page.getByRole('heading', { name: 'Welcome', exact: false })).toBeVisible()
      await expect(prompt).toHaveCount(0)
    } finally {
      await db.from('users').update({ city: null, bio: null }).eq('id', id)
    }
  })

  test('a member completes a self-confirmed step and the progress updates', async ({
    page,
    context,
    baseURL,
  }) => {
    // The seeded self steps (3 and 4) complete from their windows (onboarding-modals.spec.ts), so
    // a temporary self step with its own key stands in for the plain "mark as done" button.
    const user = fixtureUser('fresh')
    const db = adminClient()
    const id = await idOf(user.email)
    const KEY = 'e2e_self_step'
    await db.from('onboarding_steps').delete().eq('key', KEY)
    const { data: step, error } = await db
      .from('onboarding_steps')
      .insert({
        key: KEY,
        title_key: 'onboarding.steps.e2e_self_step',
        confirmed_by: 'self',
        position: 99,
      })
      .select('id')
      .single()
    if (error) throw error
    try {
      await loginAs(context, user, baseURL ?? BASE)
      await page.goto('/home')
      const row = page.getByRole('listitem').filter({ hasText: KEY })
      const before = await page.getByText(/^\d+ of \d+ steps done$/).innerText()
      await row.getByRole('button', { name: 'Mark as done' }).click()
      await expect(
        page.getByRole('status').filter({ hasText: 'Step marked as done.' }),
      ).toBeVisible()
      await expect(row.getByText('Done')).toBeVisible()
      const after = await page.getByText(/^\d+ of \d+ steps done$/).innerText()
      expect(after).not.toBe(before)
      // The step is recorded as the member's own confirmation.
      const { data: rows } = await db
        .from('user_onboarding')
        .select('completed_by')
        .eq('user_id', id)
        .eq('step_id', step.id)
      expect(rows).toEqual([{ completed_by: id }])
    } finally {
      await db.from('user_onboarding').delete().eq('step_id', step.id)
      await db.from('onboarding_steps').delete().eq('id', step.id)
    }
  })

  test('the windowed steps open a window instead of offering a plain mark-as-done button', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, fixtureUser('experienced'), baseURL ?? BASE)
    await page.goto('/home')
    const welcome = page.getByRole('listitem').filter({ hasText: 'Read the welcome document' })
    await expect(welcome.getByText('You confirm this step')).toBeVisible()
    await expect(welcome.getByRole('button', { name: 'Mark as done' })).toHaveCount(0)
    await expect(welcome.getByRole('button', { name: /^Open/ })).toBeVisible()
  })
})
