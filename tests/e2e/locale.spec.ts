import { expect, test } from '@playwright/test'
import { expectNoSeriousA11yViolations } from './helpers/a11y'

const legalRoutes = [
  { path: '/apply', heading: 'Candidati come volontario' },
  { path: '/apply/pending', heading: 'Candidatura ricevuta' },
  { path: '/apply/rejected', heading: 'Candidatura non accettata' },
  { path: '/privacy', heading: 'Informativa sulla privacy' },
]

for (const { path, heading } of legalRoutes) {
  test(`${path} renders in Italian at the same URL`, async ({ page }) => {
    await page.goto(path)
    await expect(page).toHaveURL(new RegExp(`${path}$`))
    await expect(page.locator('html')).toHaveAttribute('lang', 'it')
    await expect(page.getByRole('heading', { name: heading })).toBeVisible()
    await expectNoSeriousA11yViolations(page)
  })
}

test('the rest of the app renders in English', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
})

test('locale prefixes are not reachable as URLs', async ({ page }) => {
  for (const path of ['/en', '/it/privacy', '/en/apply']) {
    const response = await page.goto(path)
    expect(response?.status(), path).toBe(404)
  }
})
