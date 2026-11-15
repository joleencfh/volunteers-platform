// Admin management of working groups, story W-06. Needs a local Supabase, so it runs in CI.
import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { fixtureUser } from '../fixtures/users'
import { adminClient, supabaseEnv } from '../helpers/supabase'
import { expectNoSeriousA11yViolations } from './helpers/a11y'
import { loginAs } from './helpers/auth'

test.skip(!supabaseEnv(), 'needs Supabase settings (runs in CI)')

const BASE = 'http://localhost:3000'

test.describe('admin group management', () => {
  const suffix = randomUUID().slice(0, 8)
  const slug = `e2e-admin-${suffix}`
  const name = `E2E Admin Group ${suffix}`
  const description = `Synthetic group ${suffix} created by an admin.`

  test.afterAll(async () => {
    // Memberships go with the group (on delete cascade).
    await adminClient().from('working_groups').delete().eq('slug', slug)
  })

  test('an admin creates a group and adds a member, who sees it until it is archived', async ({
    page,
    context,
    baseURL,
  }) => {
    const base = baseURL ?? BASE
    await loginAs(context, fixtureUser('admin'), base)

    await page.goto('/admin/groups')
    await expect(page.getByRole('heading', { name: 'Working groups', level: 1 })).toBeVisible()
    await expect(page.getByRole('listitem').filter({ hasText: 'Lobbying' })).toBeVisible()
    await expectNoSeriousA11yViolations(page)

    await page.getByRole('link', { name: 'New group' }).click()
    await page.waitForURL(/\/admin\/groups\/new/)
    await page.getByLabel(/^Name/).fill(name)
    await page.getByLabel(/^Slug/).fill(slug)
    await page.getByLabel(/^Description/).fill(description)
    await page.getByRole('button', { name: 'Create group' }).click()
    await page.waitForURL(/\/admin\/groups\/[0-9a-f-]{36}$/)
    await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible()
    await expect(page.getByText(`Slug: ${slug} (fixed)`)).toBeVisible()
    await expect(page.getByText('This group has no members yet.')).toBeVisible()
    await expectNoSeriousA11yViolations(page)

    // A taken slug is refused with a message.
    await page.goto('/admin/groups/new')
    await page.getByLabel(/^Name/).fill(`${name} again`)
    await page.getByLabel(/^Slug/).fill(slug)
    await page.getByLabel(/^Description/).fill(description)
    await page.getByRole('button', { name: 'Create group' }).click()
    await expect(page.getByText('Another group already uses this slug.')).toBeVisible()

    // Add the fixture user `fresh` as a member.
    await page.goto('/admin/groups')
    await page.getByRole('link', { name, exact: true }).click()
    await page.waitForURL(/\/admin\/groups\/[0-9a-f-]{36}$/)
    await page
      .getByLabel(/^Active volunteer/)
      .selectOption({ label: 'E2E fresh (E2E Fixture fresh)' })
    await page.getByRole('button', { name: 'Add member' }).click()
    await expect(page.getByText('Member added.')).toBeVisible()
    await expect(page.getByText('E2E fresh (E2E Fixture fresh)', { exact: false })).toBeVisible()

    // The member now sees the full group page.
    const memberContext = await context.browser()?.newContext()
    if (!memberContext) throw new Error('no browser')
    const memberPage = await memberContext.newPage()
    await loginAs(memberContext, fixtureUser('fresh'), base)
    await memberPage.goto(`${base}/groups/${slug}`)
    await expect(memberPage.getByRole('heading', { name, level: 1 })).toBeVisible()
    await expect(
      memberPage
        .getByRole('navigation', { name: `Sections of ${name}` })
        .getByRole('link', { name: 'Members', exact: true }),
    ).toBeVisible()

    // Archiving hides the group from the member's list.
    await page.getByRole('button', { name: 'Archive group' }).click()
    await expect(page.getByText('The group is archived.')).toBeVisible()
    await memberPage.goto(`${base}/groups`)
    await expect(memberPage.getByRole('heading', { name: 'Groups', level: 1 })).toBeVisible()
    await expect(memberPage.getByRole('listitem').filter({ hasText: name })).toHaveCount(0)
    await memberPage.goto(`${base}/groups/${slug}`)
    await expect(memberPage.getByText(/could not be found/i)).toBeVisible()

    // The admin still sees it, marked archived, and can restore it.
    await page.goto('/admin/groups')
    await expect(page.getByRole('listitem').filter({ hasText: name })).toContainText('Archived')
    await page.getByRole('link', { name, exact: true }).click()
    await page.getByRole('button', { name: 'Restore group' }).click()
    await expect(page.getByText('The group is active again.')).toBeVisible()
    await memberPage.goto(`${base}/groups/${slug}`)
    await expect(memberPage.getByRole('heading', { name, level: 1 })).toBeVisible()
    await memberContext.close()
  })

  test('an admin confirms before removing a member', async ({ page, context, baseURL }) => {
    const db = adminClient()
    const slugForRemoval = `e2e-remove-${suffix}`
    const { data: group, error } = await db
      .from('working_groups')
      .insert({ slug: slugForRemoval, name: `E2E Remove ${suffix}`, description: 'Synthetic.' })
      .select('id')
      .single()
    if (error) throw error
    const { data: person, error: personError } = await db
      .from('users')
      .select('id')
      .eq('email', fixtureUser('new').email)
      .single()
    if (personError) throw personError
    const added = await db.from('wg_members').insert({ group_id: group.id, user_id: person.id })
    if (added.error) throw added.error

    try {
      await loginAs(context, fixtureUser('admin'), baseURL ?? BASE)
      await page.goto(`/admin/groups/${group.id}`)
      await page.getByRole('button', { name: 'Remove E2E new' }).click()
      await page.getByRole('button', { name: 'Cancel' }).click()
      await expect(page.getByRole('button', { name: 'Remove E2E new' })).toBeVisible()
      await page.getByRole('button', { name: 'Remove E2E new' }).click()
      await page.getByRole('button', { name: 'Confirm removal of E2E new' }).click()
      await expect(page.getByText('This group has no members yet.')).toBeVisible()
    } finally {
      await db.from('working_groups').delete().eq('id', group.id)
    }
  })

  test('a non-admin gets the not-found screen on every admin groups route', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, fixtureUser('fresh'), baseURL ?? BASE)
    for (const path of ['/admin/groups', '/admin/groups/new', `/admin/groups/${randomUUID()}`]) {
      await page.goto(path)
      await expect(page.getByText(/could not be found/i)).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Working groups' })).toHaveCount(0)
    }
  })
})
