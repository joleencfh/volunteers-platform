// Lead of the week (story W-04). Needs a local Supabase, so it runs in CI.
import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { fixtureUser, type FixtureUser } from '../fixtures/users'
import { adminClient, supabaseEnv } from '../helpers/supabase'
import { expectNoSeriousA11yViolations } from './helpers/a11y'
import { loginAs } from './helpers/auth'

test.skip(!supabaseEnv(), 'needs Supabase settings (runs in CI)')

const BASE = 'http://localhost:3000'

async function userOf(user: FixtureUser) {
  const { data, error } = await adminClient()
    .from('users')
    .select('id, display_name')
    .eq('email', user.email)
    .single()
  if (error) throw error
  return data as { id: string; display_name: string }
}

test.describe.serial('lead of the week', () => {
  const suffix = randomUUID().slice(0, 8)
  const slug = `e2e-lead-${suffix}`
  let groupId = ''
  let newcomerName = ''

  test.beforeAll(async () => {
    const db = adminClient()
    const { data, error } = await db
      .from('working_groups')
      .insert({ slug, name: `E2E Lead ${suffix}`, description: `Synthetic group ${suffix}.` })
      .select('id')
      .single()
    if (error) throw error
    groupId = data.id
    const newcomer = await userOf(fixtureUser('new'))
    newcomerName = newcomer.display_name
    const members = await db
      .from('wg_members')
      .insert(
        [
          newcomer.id,
          (await userOf(fixtureUser('fresh'))).id,
          (await userOf(fixtureUser('experienced'))).id,
        ].map((user_id) => ({ group_id: groupId, user_id })),
      )
    if (members.error) throw members.error
  })

  test.afterAll(async () => {
    // Memberships and leads go with the group (on delete cascade).
    await adminClient().from('working_groups').delete().eq('id', groupId)
  })

  test('an experienced member assigns a member as lead, and the overview shows it', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, fixtureUser('experienced'), baseURL ?? BASE)
    await page.goto(`/groups/${slug}`)
    await expect(page.getByRole('heading', { name: 'Lead of the week' })).toBeVisible()
    await expect(page.getByText('No lead this week').first()).toBeVisible()
    await expect(page.getByText('Moderate the call and check who is joining.')).toBeVisible()
    await expect(
      page.getByText('Check whether people are doing their tasks and need help.'),
    ).toBeVisible()
    await expectNoSeriousA11yViolations(page)

    await page.getByLabel('Member', { exact: true }).selectOption({ label: newcomerName })
    await page.getByRole('button', { name: 'Assign lead' }).click()
    await expect(page.getByText('Lead assigned.')).toBeVisible()

    await page.reload()
    await expect(page.getByText(`Lead this week: ${newcomerName}`).first()).toBeVisible()
    await expect(page.getByText(new RegExp(`Week of .*: ${newcomerName}`))).toBeVisible()
  })

  test('a fresh member sees the lead and the checklist but no assign form', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, fixtureUser('fresh'), baseURL ?? BASE)
    await page.goto(`/groups/${slug}`)
    await expect(page.getByText(`Lead this week: ${newcomerName}`).first()).toBeVisible()
    await expect(page.getByText('Prepare the agenda and take notes.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Assign the lead' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Assign lead' })).toHaveCount(0)
  })

  test('the lead, a new member, gets no assign form either', async ({ page, context, baseURL }) => {
    await loginAs(context, fixtureUser('new'), baseURL ?? BASE)
    await page.goto(`/groups/${slug}`)
    await expect(page.getByRole('heading', { name: 'Lead of the week' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Assign lead' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Join requests' })).toHaveCount(0)
  })
})
