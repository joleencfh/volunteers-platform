import { expect, test } from '@playwright/test'
import { expectNoSeriousA11yViolations } from './helpers/a11y'

test.describe('style guide', () => {
  test('has no serious accessibility violations', async ({ page }) => {
    await page.goto('/dev/style')
    await expect(page.getByRole('heading', { level: 1, name: 'Style guide' })).toBeVisible()
    await expectNoSeriousA11yViolations(page)
  })

  test('the dialog opens from the keyboard, traps focus and closes on Escape', async ({ page }) => {
    await page.goto('/dev/style')
    const trigger = page.getByRole('button', { name: 'Open dialog' })
    await trigger.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Dialog title' })
    await expect(dialog).toBeVisible()
    // The page behind is inert: focus is in the dialog or has left the page (body), never on
    // the content underneath.
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab')
      const focus = await dialog.evaluate((el) =>
        el.contains(document.activeElement)
          ? 'dialog'
          : document.activeElement === document.body
            ? 'browser'
            : 'page',
      )
      expect(focus).not.toBe('page')
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()
  })

  test('a toast announces itself and can be dismissed', async ({ page }) => {
    await page.goto('/dev/style')
    await page.getByRole('button', { name: 'Show toast' }).click()
    await expect(page.getByRole('status')).toContainText('Saved.')
    await page.getByRole('button', { name: 'Dismiss notification' }).click()
    await expect(page.getByRole('status')).not.toContainText('Saved.')
  })

  test('an invalid field is linked to its error', async ({ page }) => {
    await page.goto('/dev/style')
    const input = page.locator('#name-error')
    await expect(input).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByLabel('Full name').nth(1)).toHaveAccessibleDescription('Enter a name.')
  })
})

test.describe('app shell', () => {
  test('has header, main, footer and a privacy link', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('banner').getByRole('img', { name: 'PauseAI logo' })).toBeVisible()
    await expect(page.getByRole('main')).toBeVisible()
    await page.getByRole('contentinfo').getByRole('link', { name: 'Privacy notice' }).click()
    await expect(page).toHaveURL(/\/privacy$/)
    // The footer on a legal route is Italian
    await expect(page.getByRole('contentinfo')).toContainText('Informativa sulla privacy')
  })

  test('the skip link is the first tab stop and moves focus to main', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to content' })
    await expect(skip).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('#main')).toBeFocused()
  })

  for (const width of [375, 768, 1440]) {
    test(`does not scroll sideways at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/dev/style')
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(0)
    })
  }

  test('the mobile menu toggles, closes on Escape, and targets are 44px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto('/')
    const menu = page.getByRole('button', { name: 'Menu' })
    await expect(menu).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByRole('link', { name: 'Home' })).toBeHidden()
    await menu.click()
    await expect(menu).toHaveAttribute('aria-expanded', 'true')
    const home = page.getByRole('link', { name: 'Home' })
    await expect(home).toBeVisible()
    for (const target of [menu, home]) {
      const box = await target.boundingBox()
      expect(box?.height).toBeGreaterThanOrEqual(44)
    }
    await page.keyboard.press('Escape')
    await expect(menu).toHaveAttribute('aria-expanded', 'false')
  })

  test('the desktop navigation is inline, with no menu button', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Menu' })).toBeHidden()
    await expect(page.getByRole('link', { name: 'Home' })).toBeVisible()
  })
})
