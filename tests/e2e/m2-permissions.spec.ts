// Permission regression for milestone M2 (spec sections 3 and 7): for every M2 route, what a
// signed-out visitor, a non-member, a member and an admin each get, plus the default profile
// visibility. Needs a local Supabase, so it runs in CI.
import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { fixtureUser, OUTSIDER } from '../fixtures/users'
import { adminClient, supabaseEnv } from '../helpers/supabase'
import { loginAs } from './helpers/auth'

test.skip(!supabaseEnv(), 'needs Supabase settings (runs in CI)')

const BASE = 'http://localhost:3000'
const CITY = 'Permissionville'
const BIO = 'Synthetic bio for the permission test.'
const LINKEDIN = 'https://www.linkedin.com/in/synthetic-permissions'
const RISKS = 'Synthetic risks text for the permission test.'

// A member made for this spec, so the shared fixture profiles stay untouched. Every optional
// field is filled and no visibility row exists, so each field is at its default tier.
async function seedOwner() {
  const db = adminClient()
  const email = `e2e-perm-${randomUUID()}@example.test`
  const created = await db.auth.admin.createUser({ email, email_confirm: true })
  if (created.error) throw created.error
  const id = created.data.user.id
  const { error } = await db.from('users').insert({
    id,
    display_name: `Owner ${randomUUID().slice(0, 8)}`,
    real_name: 'Permission Owner',
    email,
    city: CITY,
    bio: BIO,
    linkedin_url: LINKEDIN,
    ai_safety_knowledge: 'advanced',
    ai_risks: RISKS,
  })
  if (error) throw error
  return { id, email }
}

type Outcome = 'page' | 'login' | 'refused' | 'notFound'

/** Opens the path and tells which of the four outcomes the visitor got. */
async function outcome(page: Page, path: string): Promise<Outcome> {
  const response = await page.goto(path)
  const url = new URL(page.url())
  if (url.pathname === '/login') return url.searchParams.has('error') ? 'refused' : 'login'
  if (response?.status() === 404) return 'notFound'
  return 'page'
}

test.describe('route access', () => {
  let ownerId = ''
  test.beforeAll(async () => {
    ownerId = (await seedOwner()).id
  })

  const routes = (id: string) => [
    { path: '/home', admin: false },
    { path: '/profile', admin: false },
    { path: '/settings', admin: false },
    { path: `/people/${id}`, admin: false },
    { path: '/admin', admin: true },
    { path: '/admin/applications', admin: true },
    { path: '/admin/onboarding', admin: true },
    { path: '/admin/data-requests', admin: true },
  ]

  test('a signed-out visitor is sent to /login from every route', async ({ page }) => {
    for (const route of routes(ownerId)) {
      expect(await outcome(page, route.path), route.path).toBe('login')
    }
  })

  test('a non-member with an account is refused everywhere', async ({ page, context, baseURL }) => {
    await loginAs(context, OUTSIDER, baseURL ?? BASE)
    for (const route of routes(ownerId)) {
      expect(await outcome(page, route.path), route.path).toBe('refused')
    }
  })

  test('a member sees member routes and gets a 404 on admin routes', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, fixtureUser('new'), baseURL ?? BASE)
    for (const route of routes(ownerId)) {
      const expected: Outcome = route.admin ? 'notFound' : 'page'
      expect(await outcome(page, route.path), route.path).toBe(expected)
    }
  })

  test('an admin sees every route', async ({ page, context, baseURL }) => {
    await loginAs(context, fixtureUser('admin'), baseURL ?? BASE)
    for (const route of routes(ownerId)) {
      expect(await outcome(page, route.path), route.path).toBe('page')
    }
  })

  test('the header nav has no dead or duplicated links', async ({ page, context, baseURL }) => {
    await loginAs(context, fixtureUser('admin'), baseURL ?? BASE)
    await page.goto('/home')
    const nav = page.getByRole('banner')
    const hrefs = await nav
      .getByRole('link')
      .evaluateAll((links) =>
        links.map((link) => new URL((link as HTMLAnchorElement).href).pathname),
      )
    // The logo goes to /, which sends a signed-in member to /home.
    expect(hrefs.sort()).toEqual(['/', '/admin', '/home', '/profile', '/settings'].sort())
    for (const href of hrefs.filter((href) => href !== '/')) {
      expect(await outcome(page, href), href).toBe('page')
    }
  })
})

test.describe('profile visibility defaults (spec section 7)', () => {
  let owner: { id: string; email: string }
  test.beforeAll(async () => {
    owner = await seedOwner()
  })

  test('another member sees the name, level and bio, and nothing else by default', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, fixtureUser('experienced'), baseURL ?? BASE)
    await page.goto(`/people/${owner.id}`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Owner ')
    await expect(page.getByText('Level:')).toBeVisible()
    await expect(page.getByText(BIO)).toBeVisible()
    // City and LinkedIn are admin only by default; knowledge and risks need a shared working
    // group, which nobody has until M3 (ADR-0014).
    await expect(page.getByText(CITY)).toHaveCount(0)
    await expect(page.getByText(LINKEDIN)).toHaveCount(0)
    await expect(page.getByText('AI safety knowledge level')).toHaveCount(0)
    await expect(page.getByText(RISKS)).toHaveCount(0)
    // The fixed admin-only fields never reach a member.
    await expect(page.getByText(owner.email)).toHaveCount(0)
    await expect(page.getByText('Permission Owner')).toHaveCount(0)
    await expect(page.getByText('Joined on')).toHaveCount(0)
  })

  test('an admin sees every field, fixed ones included', async ({ page, context, baseURL }) => {
    await loginAs(context, fixtureUser('admin'), baseURL ?? BASE)
    await page.goto(`/people/${owner.id}`)
    await expect(page.getByText(BIO)).toBeVisible()
    await expect(page.getByText(CITY)).toBeVisible()
    await expect(page.getByText(LINKEDIN)).toBeVisible()
    await expect(page.getByText('I know it very well')).toBeVisible()
    await expect(page.getByText(RISKS)).toBeVisible()
    await expect(page.getByText(owner.email)).toBeVisible()
    await expect(page.getByText('Permission Owner')).toBeVisible()
    await expect(page.getByText('Joined on')).toBeVisible()
  })
})
