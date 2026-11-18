// The postmortem of an activity (story T-05). Needs a local Supabase, so it runs in CI. Assertions
// check the resulting state (what shows after a reload), not transient messages.
import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { fixtureUser, type FixtureUser } from '../fixtures/users'
import { adminClient, supabaseEnv } from '../helpers/supabase'
import { expectNoSeriousA11yViolations } from './helpers/a11y'
import { loginAs } from './helpers/auth'

test.skip(!supabaseEnv(), 'needs Supabase settings (runs in CI)')

const BASE = 'http://localhost:3000'

async function userId(user: FixtureUser) {
  const { data, error } = await adminClient()
    .from('users')
    .select('id')
    .eq('email', user.email)
    .single()
  if (error) throw error
  return data.id as string
}

test.describe('activity postmortem', () => {
  const suffix = randomUUID().slice(0, 8)
  const slug = `e2e-postmortem-${suffix}`
  const titles = {
    save: `Postmortem to save ${suffix}`,
    seeded: `Postmortem seeded ${suffix}`,
    prompt: `Postmortem prompt ${suffix}`,
  }
  const ids = { save: '', seeded: '', prompt: '' }
  const seededText = `Seeded went well ${suffix}`
  let groupId = ''

  test.beforeAll(async () => {
    const db = adminClient()
    const group = await db
      .from('working_groups')
      .insert({ slug, name: `E2E Postmortem ${suffix}`, description: `Synthetic ${suffix}.` })
      .select('id')
      .single()
    if (group.error) throw group.error
    groupId = group.data.id
    const fresh = await userId(fixtureUser('fresh'))
    const experienced = await userId(fixtureUser('experienced'))
    const members = await db
      .from('wg_members')
      .insert([fresh, experienced].map((user_id) => ({ group_id: groupId, user_id })))
    if (members.error) throw members.error

    const rows = [
      { key: 'save', status: 'active', extra: {} },
      {
        key: 'seeded',
        status: 'done',
        extra: {
          postmortem_went_well: seededText,
          postmortem_learnings: `Seeded learning ${suffix}`,
        },
      },
      { key: 'prompt', status: 'done', extra: {} },
    ] as const
    for (const row of rows) {
      const inserted = await db
        .from('activities')
        .insert({
          group_id: groupId,
          type: 'campaign',
          title: titles[row.key],
          status: row.status,
          details: { message: `Message ${suffix}` },
          created_by: experienced,
          ...row.extra,
        })
        .select('id')
        .single()
      if (inserted.error) throw inserted.error
      ids[row.key] = inserted.data.id
    }
    // The fresh member takes part in the first activity only: a participant who is not the creator
    // or the lead, so only the postmortem path lets them write.
    const people = await db
      .from('activity_participants')
      .insert({ activity_id: ids.save, user_id: fresh, role: 'participant' })
    if (people.error) throw people.error
  })

  test.afterAll(async () => {
    // Activities and participants go with the group (on delete cascade).
    await adminClient().from('working_groups').delete().eq('id', groupId)
  })

  const open = async (page: Page, key: keyof typeof titles) => {
    await page.goto(`/groups/${slug}/activities/${ids[key]}`)
    await expect(page.getByRole('heading', { name: titles[key], level: 1 })).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Postmortem', level: 2, exact: true }),
    ).toBeVisible()
  }

  test('a participant saves a postmortem and the three fields show afterwards', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, fixtureUser('fresh'), baseURL ?? BASE)
    await open(page, 'save')

    await page.getByLabel('What went well', { exact: true }).fill('Good turnout')
    await page.getByLabel('Points for improvement', { exact: true }).fill('Announce earlier')
    await page.getByLabel(/^General learning points/).fill('Ask for help sooner')
    // Reloading right after the click would cancel the save: wait for the server action's response.
    const saved = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('/activities/'),
    )
    await page.getByRole('button', { name: 'Save postmortem', exact: true }).click()
    await saved

    await page.reload()
    await expect(page.getByLabel('What went well', { exact: true })).toHaveValue('Good turnout')
    await expect(page.getByLabel('Points for improvement', { exact: true })).toHaveValue(
      'Announce earlier',
    )
    await expect(page.getByLabel(/^General learning points/)).toHaveValue('Ask for help sooner')
    await expectNoSeriousA11yViolations(page)
  })

  test('a member who does not take part reads the postmortem but has no form', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, fixtureUser('fresh'), baseURL ?? BASE)
    await open(page, 'seeded')

    await expect(page.getByText(seededText, { exact: true })).toBeVisible()
    await expect(page.getByText(`Seeded learning ${suffix}`, { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save postmortem', exact: true })).toHaveCount(0)
    await expect(page.getByLabel('What went well', { exact: true })).toHaveCount(0)
    await expectNoSeriousA11yViolations(page)
  })

  test('a done activity without a postmortem shows a prompt, quietly to those who only read', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, fixtureUser('experienced'), baseURL ?? BASE)
    await open(page, 'prompt')
    await expect(
      page.getByText('This activity is done. What went well and what would you change?'),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save postmortem', exact: true })).toBeVisible()
    await context.clearCookies()

    await loginAs(context, fixtureUser('fresh'), baseURL ?? BASE)
    await open(page, 'prompt')
    await expect(page.getByText(/has no postmortem yet/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save postmortem', exact: true })).toHaveCount(0)
  })
})
