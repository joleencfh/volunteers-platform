// Data requests of story P-03: a member files one, an admin handles it. Needs a local Supabase,
// so it runs in CI. No email goes out in CI (no provider key), and the request is saved anyway.
import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { fixtureUser } from '../fixtures/users'
import { adminClient, supabaseEnv } from '../helpers/supabase'
import { expectNoSeriousA11yViolations } from './helpers/a11y'
import { loginAs } from './helpers/auth'

test.skip(!supabaseEnv(), 'needs Supabase settings (runs in CI)')

const BASE = 'http://localhost:3000'

// A member created just for the test, so requests never collide with other specs' fixture users.
async function seedMember() {
  const db = adminClient()
  const email = `e2e-data-request-${randomUUID()}@example.test`
  const created = await db.auth.admin.createUser({ email, email_confirm: true })
  if (created.error) throw created.error
  const displayName = `Requester ${randomUUID().slice(0, 8)}`
  const { error } = await db.from('users').insert({
    id: created.data.user.id,
    display_name: displayName,
    real_name: 'Requester Example',
    email,
  })
  if (error) throw error
  return { id: created.data.user.id, displayName }
}

test.describe('a member filing requests', () => {
  // Uses a fixture member (the seeded members have the shared test password), so the requests
  // are cleared before and after to keep the runs independent.
  test.describe.configure({ mode: 'serial' })
  const member = fixtureUser('new')

  async function clearRequests() {
    const db = adminClient()
    const { data } = await db.from('users').select('id').eq('email', member.email).single()
    if (data) await db.from('data_requests').delete().eq('user_id', data.id)
    return data?.id
  }

  test.beforeEach(async ({ context }) => {
    await clearRequests()
    // The welcome window opens by itself on /home; "Later" keeps it closed (see home.spec.ts).
    await context.addInitScript(() => {
      window.sessionStorage.setItem('onboarding-window-later:read_welcome_document', '1')
    })
  })
  test.afterEach(async () => {
    await clearRequests()
  })

  test('files a request, sees it, and a second click adds nothing', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, member, baseURL ?? BASE)
    await page.goto('/settings')

    await page.getByLabel('What do you need?').selectOption('export')
    await page.getByRole('button', { name: 'Send request' }).click()
    await expect(page.getByText('Your request was recorded.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Your requests' })).toBeVisible()
    await expect(page.getByRole('listitem').filter({ hasText: 'Export of my data' })).toHaveCount(1)

    await page.getByRole('button', { name: 'Send request' }).click()
    await expect(page.getByText('Your request was recorded.')).toBeVisible()
    const db = adminClient()
    const { data } = await db.from('users').select('id').eq('email', member.email).single()
    const { count } = await db
      .from('data_requests')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', data?.id ?? '')
    expect(count).toBe(1)
  })
})

test('an admin sees a request and marks it handled', async ({ page, context, baseURL }) => {
  const member = await seedMember()
  const { error } = await adminClient()
    .from('data_requests')
    .insert({ user_id: member.id, kind: 'deletion' })
  if (error) throw error

  await loginAs(context, fixtureUser('admin'), baseURL ?? BASE)
  await page.goto('/admin/data-requests')
  const card = page.getByRole('listitem').filter({ hasText: member.displayName })
  await expect(card).toBeVisible()
  await expect(card.getByText('Deletion')).toBeVisible()

  await card.getByRole('button', { name: 'Mark as handled' }).click()
  await expect(card.getByText('Handled', { exact: true })).toBeVisible()

  const { data } = await adminClient()
    .from('data_requests')
    .select('status, handled_by')
    .eq('user_id', member.id)
    .single()
  expect(data?.status).toBe('done')
  expect(data?.handled_by).not.toBeNull()
})

test('a non-admin gets a 404 on the admin list', async ({ page, context, baseURL }) => {
  await loginAs(context, fixtureUser('fresh'), baseURL ?? BASE)
  await page.goto('/admin/data-requests')
  await expect(page.getByRole('heading', { name: 'Data requests' })).toHaveCount(0)
  await expect(page.getByText(/could not be found/i)).toBeVisible()
})

test('both data request pages have no serious accessibility violations', async ({
  page,
  context,
  baseURL,
}) => {
  await loginAs(context, fixtureUser('admin'), baseURL ?? BASE)
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Your data' })).toBeVisible()
  await expectNoSeriousA11yViolations(page)

  await page.goto('/admin/data-requests')
  await expect(page.getByRole('heading', { name: 'Data requests', level: 1 })).toBeVisible()
  await expectNoSeriousA11yViolations(page)
})
