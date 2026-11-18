// Editing, archiving, joining, leaving and the lead of an activity (story T-03, part 2). Needs a
// local Supabase, so it runs in CI. Assertions check the resulting state, not transient messages.
import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
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

test.describe('activities: join, edit, lead and archive', () => {
  const suffix = randomUUID().slice(0, 8)
  const slug = `e2e-participants-${suffix}`
  const titles = {
    join: `Joinable ${suffix}`,
    observe: `Observable ${suffix}`,
    byFresh: `By a fresh member ${suffix}`,
    byExperienced: `By an experienced member ${suffix}`,
    lead: `Leadable ${suffix}`,
    archive: `Archivable ${suffix}`,
  }
  const ids: Record<keyof typeof titles, string> = {
    join: '',
    observe: '',
    byFresh: '',
    byExperienced: '',
    lead: '',
    archive: '',
  }
  let groupId = ''
  let freshName = ''

  test.beforeAll(async () => {
    const db = adminClient()
    const group = await db
      .from('working_groups')
      .insert({ slug, name: `E2E Participants ${suffix}`, description: `Synthetic ${suffix}.` })
      .select('id')
      .single()
    if (group.error) throw group.error
    groupId = group.data.id
    const fresh = await userOf(fixtureUser('fresh'))
    const newcomer = await userOf(fixtureUser('new'))
    const experienced = await userOf(fixtureUser('experienced'))
    freshName = fresh.display_name
    const members = await db
      .from('wg_members')
      .insert(
        [fresh.id, newcomer.id, experienced.id].map((user_id) => ({ group_id: groupId, user_id })),
      )
    if (members.error) throw members.error

    const creators: Record<keyof typeof titles, string> = {
      join: experienced.id,
      observe: experienced.id,
      byFresh: fresh.id,
      byExperienced: experienced.id,
      lead: experienced.id,
      archive: fresh.id,
    }
    for (const key of Object.keys(titles) as (keyof typeof titles)[]) {
      const row = await db
        .from('activities')
        .insert({
          group_id: groupId,
          type: 'campaign',
          title: titles[key],
          status: 'planned',
          details: { message: `Message ${suffix}` },
          created_by: creators[key],
        })
        .select('id')
        .single()
      if (row.error) throw row.error
      ids[key] = row.data.id
    }
    // The lead selector must list participants only: a participant and an observer are seeded.
    const people = await db.from('activity_participants').insert([
      { activity_id: ids.lead, user_id: fresh.id, role: 'participant' },
      { activity_id: ids.lead, user_id: newcomer.id, role: 'observer' },
    ])
    if (people.error) throw people.error
  })

  test.afterAll(async () => {
    // Activities and participants go with the group (on delete cascade).
    await adminClient().from('working_groups').delete().eq('id', groupId)
  })

  const open = async (page: Page, key: keyof typeof titles) => {
    await page.goto(`/groups/${slug}/activities/${ids[key]}`)
    await expect(page.getByRole('heading', { name: titles[key], level: 1 })).toBeVisible()
  }

  test('a fresh member joins as participant and can leave again', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, fixtureUser('fresh'), baseURL ?? BASE)
    await open(page, 'join')

    await page.getByLabel('Role', { exact: true }).selectOption('participant')
    await page.getByRole('button', { name: 'Join', exact: true }).click()
    await expect(page.getByText('You take part as: Participant')).toBeVisible()

    await page.getByRole('button', { name: 'Leave', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Join', exact: true })).toBeVisible()
    await expect(page.getByText('You take part as: Participant')).toHaveCount(0)
  })

  test('a new volunteer can only join as observer', async ({ page, context, baseURL }) => {
    await loginAs(context, fixtureUser('new'), baseURL ?? BASE)
    await open(page, 'observe')

    // No role choice: observing is the only way in.
    await expect(page.getByLabel('Role', { exact: true })).toHaveCount(0)
    await expect(page.getByText('New volunteers join activities as observers.')).toBeVisible()
    await page.getByRole('button', { name: 'Join', exact: true }).click()
    await expect(page.getByText('You take part as: Observer')).toBeVisible()
    // And no edit, lead or archive controls for them.
    await expect(page.getByRole('heading', { name: 'Edit this activity' })).toHaveCount(0)
  })

  test('an experienced member edits someone else’s activity; a fresh member cannot', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, fixtureUser('experienced'), baseURL ?? BASE)
    await open(page, 'byFresh')
    await expect(page.getByRole('heading', { name: 'Edit this activity' })).toBeVisible()
    await expectNoSeriousA11yViolations(page)

    const edited = `Edited ${suffix}`
    await page.getByLabel('Title', { exact: true }).fill(edited)
    await page.getByLabel('Status', { exact: true }).selectOption('active')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('heading', { name: edited, level: 1 })).toBeVisible()
    await expect(page.getByText('Active', { exact: true }).first()).toBeVisible()

    // Put the title back, so the other tests still find the activity by its title.
    await page.getByLabel('Title', { exact: true }).fill(titles.byFresh)
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('heading', { name: titles.byFresh, level: 1 })).toBeVisible()

    await context.clearCookies()
    await loginAs(context, fixtureUser('fresh'), baseURL ?? BASE)
    await open(page, 'byExperienced')
    await expect(page.getByRole('heading', { name: 'Edit this activity' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0)
    // A fresh member still edits what they created themselves.
    await open(page, 'byFresh')
    await expect(page.getByRole('heading', { name: 'Edit this activity' })).toBeVisible()
  })

  test('the lead selector offers only participants', async ({ page, context, baseURL }) => {
    await loginAs(context, fixtureUser('experienced'), baseURL ?? BASE)
    await open(page, 'lead')

    const options = page.getByLabel('Lead', { exact: true }).locator('option')
    await expect(options).toHaveText(['No lead', freshName])

    await page.getByLabel('Lead', { exact: true }).selectOption({ label: freshName })
    await page.getByRole('button', { name: 'Set lead' }).click()
    // The summary line above shows the new lead.
    await expect(page.locator('dl').getByText(freshName)).toBeVisible()
  })

  test('archiving hides the activity from the default list, restoring brings it back', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, fixtureUser('fresh'), baseURL ?? BASE)
    await open(page, 'archive')

    await page.getByRole('button', { name: 'Archive activity' }).click()
    await expect(page.getByText('Archived', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Restore activity' })).toBeVisible()

    await page.goto(`/groups/${slug}?tab=activities`)
    await expect(page.getByRole('link', { name: titles.join })).toBeVisible()
    await expect(page.getByRole('link', { name: titles.archive })).toHaveCount(0)

    await open(page, 'archive')
    await page.getByRole('button', { name: 'Restore activity' }).click()
    await expect(page.getByRole('button', { name: 'Archive activity' })).toBeVisible()
    await page.goto(`/groups/${slug}?tab=activities`)
    await expect(page.getByRole('link', { name: titles.archive })).toBeVisible()
  })

  test('the General activity has no edit or archive controls', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, fixtureUser('experienced'), baseURL ?? BASE)
    await page.goto(`/groups/${slug}?tab=activities`)
    await page.getByRole('link', { name: 'General', exact: true }).click()
    await page.waitForURL(/\/activities\/[0-9a-f-]{36}$/)
    await expect(page.getByRole('heading', { name: 'General', level: 1 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Edit this activity' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Archive activity' })).toHaveCount(0)
  })
})
