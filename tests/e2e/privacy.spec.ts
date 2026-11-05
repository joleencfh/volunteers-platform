// The public privacy notice of story A-05. Needs no sign-in.
import { expect, test } from '@playwright/test'
import { expectNoSeriousA11yViolations } from './helpers/a11y'

test('the privacy notice is reachable logged out, in Italian, marked as a draft', async ({
  page,
}) => {
  await page.goto('/privacy')
  await expect(page).toHaveURL(/\/privacy$/)
  await expect(
    page.getByRole('heading', { level: 1, name: 'Informativa sulla privacy' }),
  ).toBeVisible()
  await expect(page.getByTestId('privacy-draft-marker')).toContainText('BOZZA')
  await expect(page.getByRole('heading', { name: 'Per quanto tempo li conserviamo' })).toBeVisible()
  await expectNoSeriousA11yViolations(page)
})

test('every page links to the notice from the footer', async ({ page }) => {
  await page.goto('/')
  await page
    .getByRole('contentinfo')
    .getByRole('link', { name: /privacy/i })
    .click()
  await expect(page).toHaveURL(/\/privacy$/)
})
