// The review journey of story A-04. Needs a local Supabase, so it runs in CI.
import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { fixtureUser } from '../fixtures/users'
import { adminClient, supabaseEnv } from '../helpers/supabase'
import { loginAs } from './helpers/auth'

test.skip(!supabaseEnv(), 'needs Supabase settings (runs in CI)')

const BASE = 'http://localhost:3000'

async function seedApplication() {
  const email = `e2e-review-${randomUUID()}@example.test`
  const { data, error } = await adminClient()
    .from('applications')
    .insert({
      display_name: `Reviewee ${email.slice(11, 19)}`,
      real_name: 'Review Example',
      email,
      city: 'Test City',
      heard_via: 'word_of_mouth',
      privacy_accepted_at: new Date().toISOString(),
      special_category_consent_at: new Date().toISOString(),
      notice_version: 'e2e',
    })
    .select('id, display_name')
    .single()
  if (error) throw error
  return { email, id: data.id, displayName: data.display_name }
}

test('a non-admin cannot open the review page', async ({ page, context, baseURL }) => {
  await loginAs(context, fixtureUser('fresh'), baseURL ?? BASE)
  await page.goto('/admin/applications')
  await expect(page.getByRole('heading', { name: 'Applications' })).toHaveCount(0)
  await expect(page.getByText(/could not be found/i)).toBeVisible()
})

test('an admin approves an application: one member is created', async ({
  page,
  context,
  baseURL,
}) => {
  const application = await seedApplication()
  await loginAs(context, fixtureUser('admin'), baseURL ?? BASE)
  await page.goto('/admin/applications')

  const card = page.getByRole('listitem').filter({ hasText: application.email })
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: 'Approve' }).click()
  await expect(card.getByRole('status')).toContainText(/Decision saved/)

  const db = adminClient()
  const { data: members } = await db.from('users').select('id').eq('email', application.email)
  expect(members).toHaveLength(1)
  const { data: row } = await db
    .from('applications')
    .select('status')
    .eq('id', application.id)
    .single()
  expect(row?.status).toBe('approved')
})

test('an admin rejects an application: no member is created', async ({
  page,
  context,
  baseURL,
}) => {
  const application = await seedApplication()
  await loginAs(context, fixtureUser('admin'), baseURL ?? BASE)
  await page.goto('/admin/applications')

  const card = page.getByRole('listitem').filter({ hasText: application.email })
  await card.getByRole('button', { name: 'Reject' }).click()
  await expect(card.getByRole('status')).toContainText(/Decision saved/)

  const db = adminClient()
  const { data: members } = await db.from('users').select('id').eq('email', application.email)
  expect(members).toHaveLength(0)
  const { data: row } = await db
    .from('applications')
    .select('status')
    .eq('id', application.id)
    .single()
  expect(row?.status).toBe('rejected')
})
