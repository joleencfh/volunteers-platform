// Meetings and group links (story W-05). Needs a local Supabase, so it runs in CI.
import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { fixtureUser, type FixtureUser } from '../fixtures/users'
import { adminClient, supabaseEnv } from '../helpers/supabase'
import { expectNoSeriousA11yViolations } from './helpers/a11y'
import { loginAs } from './helpers/auth'

test.skip(!supabaseEnv(), 'needs Supabase settings (runs in CI)')

const BASE = 'http://localhost:3000'
const SIGNAL = 'https://signal.group/#synthetic-meetings'
const DOCS = 'https://docs.example.test/synthetic-group'
const MEETING = 'https://meet.example.test/synthetic-room'

async function idOf(user: FixtureUser) {
  const { data, error } = await adminClient()
    .from('users')
    .select('id')
    .eq('email', user.email)
    .single()
  if (error) throw error
  return data.id as string
}

test.describe.serial('meetings and links', () => {
  const suffix = randomUUID().slice(0, 8)
  const slug = `e2e-meetings-${suffix}`
  let groupId = ''

  test.beforeAll(async () => {
    const db = adminClient()
    const { data, error } = await db
      .from('working_groups')
      .insert({ slug, name: `E2E Meetings ${suffix}`, description: `Synthetic group ${suffix}.` })
      .select('id')
      .single()
    if (error) throw error
    groupId = data.id
    const members = await db.from('wg_members').insert(
      [await idOf(fixtureUser('new')), await idOf(fixtureUser('fresh'))].map((user_id) => ({
        group_id: groupId,
        user_id,
      })),
    )
    if (members.error) throw members.error
  })

  test.afterAll(async () => {
    // Memberships and meetings go with the group (on delete cascade).
    await adminClient().from('working_groups').delete().eq('id', groupId)
  })

  test('a fresh member adds a meeting and it shows under upcoming on the Overview', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, fixtureUser('fresh'), baseURL ?? BASE)
    await page.goto(`/groups/${slug}?tab=meetings`)
    await expect(page.getByText('No meetings planned')).toBeVisible()

    const form = page.getByRole('region', { name: 'Add a meeting' })
    await form.getByLabel('Date and time (Italian time)').fill('2031-06-15T20:30')
    await form.getByLabel('Meeting link').fill(MEETING)
    await form.getByRole('button', { name: 'Add meeting' }).click()
    await expect(page.getByText('Meeting added.')).toBeVisible()

    const upcoming = page.getByRole('region', { name: 'Upcoming meetings' })
    await expect(upcoming.getByText(/June 15, 2031.*8:30\sPM/)).toBeVisible()
    await expect(upcoming.getByRole('link', { name: 'Meeting link' })).toHaveAttribute(
      'href',
      MEETING,
    )
    await expectNoSeriousA11yViolations(page)

    await page.goto(`/groups/${slug}`)
    await expect(page.getByRole('heading', { name: 'Next meetings' })).toBeVisible()
    await expect(page.getByText(/June 15, 2031.*8:30\sPM/)).toBeVisible()
  })

  test('a fresh member changes the meeting and deletes it', async ({ page, context, baseURL }) => {
    await loginAs(context, fixtureUser('fresh'), baseURL ?? BASE)
    await page.goto(`/groups/${slug}?tab=meetings`)
    await page.getByText('Edit', { exact: false }).first().click()
    await page.getByLabel('Agenda link (optional)').first().fill('https://docs.example.test/agenda')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Meeting saved.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Agenda' })).toHaveAttribute(
      'href',
      'https://docs.example.test/agenda',
    )

    await page.getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByText('No meetings planned')).toBeVisible()
  })

  test('a new member sees the meetings but has no form', async ({ page, context, baseURL }) => {
    const { error } = await adminClient()
      .from('wg_meetings')
      .insert({ group_id: groupId, starts_at: '2031-07-01T18:00:00Z', meeting_url: MEETING })
    if (error) throw error

    await loginAs(context, fixtureUser('new'), baseURL ?? BASE)
    await page.goto(`/groups/${slug}`)
    await expect(page.getByRole('heading', { name: 'Next meetings' })).toBeVisible()
    await expect(page.getByText(/July 1, 2031/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save links' })).toHaveCount(0)

    await page.goto(`/groups/${slug}?tab=meetings`)
    await expect(page.getByText(/July 1, 2031/)).toBeVisible()
    await expect(page.getByRole('link', { name: 'Meeting link' })).toHaveAttribute('href', MEETING)
    await expect(page.getByRole('button', { name: 'Add meeting' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Add a meeting' })).toHaveCount(0)
    await expect(page.getByText('Edit', { exact: true })).toHaveCount(0)
  })

  test('a fresh member sets and clears the group links', async ({ page, context, baseURL }) => {
    await loginAs(context, fixtureUser('fresh'), baseURL ?? BASE)
    await page.goto(`/groups/${slug}`)
    await expect(page.getByText('No links have been added yet.')).toBeVisible()

    await page.getByLabel('Signal group link').fill(SIGNAL)
    await page.getByLabel('Documents link').fill(DOCS)
    await page.getByRole('button', { name: 'Save links' }).click()
    await expect(page.getByText('Links saved.')).toBeVisible()

    await page.reload()
    await expect(page.getByRole('link', { name: 'Signal group', exact: true })).toHaveAttribute(
      'href',
      SIGNAL,
    )
    await expect(page.getByRole('link', { name: 'Documents', exact: true })).toHaveAttribute(
      'href',
      DOCS,
    )
    await expectNoSeriousA11yViolations(page)

    await page.getByLabel('Signal group link').fill('')
    await page.getByLabel('Documents link').fill('')
    await page.getByRole('button', { name: 'Save links' }).click()
    await expect(page.getByText('Links saved.')).toBeVisible()
    await page.reload()
    await expect(page.getByText('No links have been added yet.')).toBeVisible()
  })
})
