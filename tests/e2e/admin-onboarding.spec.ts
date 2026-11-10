// The admin onboarding overview of story O-03. Needs a local Supabase, so it runs in CI.
import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { fixtureUser } from '../fixtures/users'
import { adminClient, supabaseEnv } from '../helpers/supabase'
import { expectNoSeriousA11yViolations } from './helpers/a11y'
import { loginAs } from './helpers/auth'

test.skip(!supabaseEnv(), 'needs Supabase settings (runs in CI)')

const BASE = 'http://localhost:3000'

// A member created just for the test, so ticking never collides with other specs' fixture users.
// Members have a trigger-made step 1 only: all three admin steps are open.
async function seedMember() {
  const db = adminClient()
  const email = `e2e-onboarding-${randomUUID()}@example.test`
  const created = await db.auth.admin.createUser({ email, email_confirm: true })
  if (created.error) throw created.error
  const displayName = `Overview ${randomUUID().slice(0, 8)}`
  const { error } = await db.from('users').insert({
    id: created.data.user.id,
    display_name: displayName,
    real_name: 'Overview Example',
    email,
  })
  if (error) throw error
  return { id: created.data.user.id, displayName }
}

async function auditCount(userId: string, action: string) {
  const { count, error } = await adminClient()
    .from('audit_log')
    .select('id', { count: 'exact', head: true })
    .eq('entity_id', userId)
    .eq('action', action)
  if (error) throw error
  return count ?? 0
}

test('a non-admin cannot open the onboarding overview', async ({ page, context, baseURL }) => {
  await loginAs(context, fixtureUser('fresh'), baseURL ?? BASE)
  await page.goto('/admin/onboarding')
  await expect(page.getByRole('heading', { name: 'Onboarding' })).toHaveCount(0)
  await expect(page.getByText(/could not be found/i)).toBeVisible()
})

test('an admin ticks and unticks a step and each change is audited', async ({
  page,
  context,
  baseURL,
}) => {
  const member = await seedMember()
  await loginAs(context, fixtureUser('admin'), baseURL ?? BASE)
  await page.goto('/admin/onboarding')

  const card = page.getByRole('listitem').filter({ hasText: member.displayName })
  await expect(card).toBeVisible()
  const signal = card.getByRole('checkbox', { name: 'Added to the Signal group' })
  await expect(signal).not.toBeChecked()

  await signal.click()
  await expect(signal).toBeChecked()
  await expect(card.getByRole('status').filter({ hasText: 'Marked as done' })).toBeVisible()
  expect(await auditCount(member.id, 'onboarding.step_confirmed')).toBe(1)

  // The person stays visible after the change, so a mistake can be undone.
  await signal.click()
  await expect(signal).not.toBeChecked()
  await expect(card.getByRole('status').filter({ hasText: 'Marked as not done' })).toBeVisible()
  expect(await auditCount(member.id, 'onboarding.step_unconfirmed')).toBe(1)
})

test('the step filter narrows the list and a finished person drops off after a reload', async ({
  page,
  context,
  baseURL,
}) => {
  const member = await seedMember()
  await loginAs(context, fixtureUser('admin'), baseURL ?? BASE)
  await page.goto('/admin/onboarding')

  const card = page.getByRole('listitem').filter({ hasText: member.displayName })
  for (const name of [
    'Added to the Signal group',
    'Took part in the first group call',
    'One-on-one check-in of 15–20 minutes',
  ]) {
    await card.getByRole('checkbox', { name }).click()
    await expect(card.getByRole('checkbox', { name })).toBeChecked()
  }
  await expect(card).toBeVisible()

  await page.reload()
  await expect(page.getByText(member.displayName)).toHaveCount(0)

  await page.getByRole('link', { name: 'Added to the Signal group' }).click()
  await expect(page).toHaveURL(/\/admin\/onboarding\?step=signal_group$/)
  await expect(page.getByRole('link', { name: 'Added to the Signal group' })).toHaveAttribute(
    'aria-current',
    'page',
  )
})

test('the onboarding overview has no serious accessibility violations', async ({
  page,
  context,
  baseURL,
}) => {
  await seedMember()
  await loginAs(context, fixtureUser('admin'), baseURL ?? BASE)
  await page.goto('/admin/onboarding')
  await expect(page.getByRole('heading', { name: 'Onboarding', level: 1 })).toBeVisible()
  await expectNoSeriousA11yViolations(page)
})
