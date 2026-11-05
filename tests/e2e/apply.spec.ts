// The application journey of story A-03. Needs a local Supabase, so it runs in CI.
import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { adminClient, supabaseEnv } from '../helpers/supabase'
import { expectNoSeriousA11yViolations } from './helpers/a11y'

test.skip(!supabaseEnv(), 'needs Supabase settings (runs in CI)')

const uniqueEmail = () => `e2e-apply-${randomUUID()}@example.test`

async function fill(page: Page, email: string) {
  await page.getByLabel('Nome visibile').fill('Tester')
  await page.getByLabel('Nome', { exact: true }).fill('Test')
  await page.getByLabel('Cognome').fill('Applicant')
  await page.getByLabel('Indirizzo email').fill(email)
  await page.getByLabel('Città o regione').fill('Test City')
  await page.getByLabel('Come hai conosciuto PauseAI?').selectOption('word_of_mouth')
  await page.getByLabel("Quanto conosci la sicurezza dell'IA?").selectOption('basic')
}

async function consent(page: Page) {
  await page.getByLabel(/Ho letto e accetto l'informativa/).check()
  await page.getByLabel(/Acconsento esplicitamente/).check()
}

async function rowsFor(email: string) {
  const { data, error } = await adminClient()
    .from('applications')
    .select('status, notice_version, privacy_accepted_at, special_category_consent_at')
    .eq('email', email)
  if (error) throw error
  return data ?? []
}

test('the form is in Italian and has no serious accessibility violations', async ({ page }) => {
  await page.goto('/apply')
  await expect(page.getByRole('heading', { name: 'Candidati come volontario' })).toBeVisible()
  await expectNoSeriousA11yViolations(page)
})

test('a valid application is stored and shows the pending screen', async ({ page }) => {
  const email = uniqueEmail()
  await page.goto('/apply')
  await fill(page, email)
  await consent(page)
  await page.getByRole('button', { name: 'Invia la candidatura' }).click()

  await expect(page).toHaveURL(/\/apply\/pending$/)
  await expect(page.getByRole('heading', { name: 'Candidatura ricevuta' })).toBeVisible()
  const rows = await rowsFor(email)
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ status: 'pending' })
  expect(rows[0].privacy_accepted_at).not.toBeNull()
  expect(rows[0].special_category_consent_at).not.toBeNull()
})

test('a second application for the same email adds nothing', async ({ page }) => {
  const email = uniqueEmail()
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto('/apply')
    await fill(page, email)
    await consent(page)
    await page.getByRole('button', { name: 'Invia la candidatura' }).click()
    await expect(page).toHaveURL(/\/apply\/pending$/)
  }
  expect(await rowsFor(email)).toHaveLength(1)
})

test('a filled honeypot looks like success but stores nothing', async ({ page }) => {
  const email = uniqueEmail()
  await page.goto('/apply')
  await fill(page, email)
  await consent(page)
  await page.locator('input[name="company_website"]').evaluate((input: HTMLInputElement) => {
    input.value = 'https://spam.example'
  })
  await page.getByRole('button', { name: 'Invia la candidatura' }).click()

  await expect(page).toHaveURL(/\/apply\/pending$/)
  expect(await rowsFor(email)).toHaveLength(0)
})

test('both consents are required', async ({ page }) => {
  const email = uniqueEmail()
  await page.goto('/apply')
  await fill(page, email)
  await page.getByLabel(/Ho letto e accetto l'informativa/).check()
  await page.getByRole('button', { name: 'Invia la candidatura' }).click()

  await expect(page).toHaveURL(/\/apply$/)
  await expect(page.getByText('Questo campo è obbligatorio.')).toHaveCount(1)
  // The typed values survive the refusal.
  await expect(page.getByLabel('Indirizzo email')).toHaveValue(email)
  await expectNoSeriousA11yViolations(page)
  expect(await rowsFor(email)).toHaveLength(0)
})
