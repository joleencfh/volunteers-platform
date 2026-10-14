import { expect, test } from '@playwright/test'
import { expectNoSeriousA11yViolations } from './helpers/a11y'

test('home page renders and has no serious accessibility violations', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'PauseAI IT' })).toBeVisible()
  await expectNoSeriousA11yViolations(page)
})
