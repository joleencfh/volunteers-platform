// "My work" on /home and the real data in the onboarding "current activities" window (story T-06,
// part 1). Needs a local Supabase, so it runs in CI. Assertions check what is listed, not
// transient messages.
import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { fixtureUser, type FixtureUser } from '../fixtures/users'
import { adminClient, supabaseEnv } from '../helpers/supabase'
import { expectNoSeriousA11yViolations } from './helpers/a11y'
import { loginAs } from './helpers/auth'

test.skip(!supabaseEnv(), 'needs Supabase settings (runs in CI)')

const BASE = 'http://localhost:3000'
const ACTIVITIES_STEP = 'Looked at current activities'

async function idOf(user: FixtureUser) {
  const { data, error } = await adminClient()
    .from('users')
    .select('id')
    .eq('email', user.email)
    .single()
  if (error) throw error
  return data.id as string
}

test.describe('my work on /home', () => {
  // The windowed steps are reset for the fixture members, so the tests run one after the other.
  test.describe.configure({ mode: 'serial' })

  const suffix = randomUUID().slice(0, 8)
  const slug = `e2e-home-work-${suffix}`
  const activityTitle = `Home work activity ${suffix}`
  const generalNote = `Planned work ${suffix}`
  const taskTitle = `Home work task ${suffix}`
  let groupId = ''

  test.beforeEach(async ({ context }) => {
    // The welcome window opens by itself on first login and would cover the page.
    await context.addInitScript(() => {
      window.sessionStorage.setItem('onboarding-window-later:read_welcome_document', '1')
    })
  })

  test.beforeAll(async () => {
    const db = adminClient()
    const fresh = await idOf(fixtureUser('fresh'))
    const group = await db
      .from('working_groups')
      .insert({ slug, name: `E2E Home Work ${suffix}`, description: `Synthetic ${suffix}.` })
      .select('id')
      .single()
    if (group.error) throw group.error
    groupId = group.data.id
    const member = await db.from('wg_members').insert({ group_id: groupId, user_id: fresh })
    if (member.error) throw member.error

    const activities = await db
      .from('activities')
      .insert([
        {
          group_id: groupId,
          type: 'campaign',
          title: activityTitle,
          status: 'active',
          details: { message: `Message ${suffix}` },
          created_by: fresh,
        },
        {
          group_id: groupId,
          type: 'campaign',
          title: generalNote,
          status: 'planned',
          details: { message: `Message ${suffix}` },
          created_by: fresh,
        },
      ])
      .select('id, title')
    if (activities.error) throw activities.error
    const active = activities.data.find((row) => row.title === activityTitle)!
    const participant = await db
      .from('activity_participants')
      .insert({ activity_id: active.id, user_id: fresh, role: 'participant' })
    if (participant.error) throw participant.error
    const task = await db.from('tasks').insert({
      activity_id: active.id,
      group_id: groupId,
      title: taskTitle,
      assignee_id: fresh,
      created_by: fresh,
    })
    if (task.error) throw task.error
  })

  test.afterAll(async () => {
    // Activities, participants and tasks go with the group (on delete cascade).
    await adminClient().from('working_groups').delete().eq('id', groupId)
  })

  /** Forgets the member's progress on the activities step so its window can be opened. */
  async function resetActivitiesStep(user: FixtureUser) {
    const db = adminClient()
    const { data: step } = await db
      .from('onboarding_steps')
      .select('id')
      .eq('key', 'looked_at_activities')
      .single()
    if (step) {
      await db
        .from('user_onboarding')
        .delete()
        .eq('user_id', await idOf(user))
        .eq('step_id', step.id)
    }
  }

  test('a member with an open task sees it and the activity on /home, and the step 4 window lists the activity', async ({
    page,
    context,
    baseURL,
  }) => {
    const user = fixtureUser('fresh')
    await resetActivitiesStep(user)
    await loginAs(context, user, baseURL ?? BASE)
    await page.goto('/home')

    const work = page.getByRole('region', { name: 'My work' })
    await expect(work.getByRole('link', { name: taskTitle })).toBeVisible()
    await expect(work.getByRole('link', { name: activityTitle })).toBeVisible()
    await expect(work.getByRole('link', { name: 'All my tasks' })).toBeVisible()
    // A planned activity the member does not take part in is not part of "my activities".
    await expect(work.getByText(generalNote)).toHaveCount(0)

    await page
      .getByRole('listitem')
      .filter({ hasText: ACTIVITIES_STEP })
      .getByRole('button', { name: /^Open/ })
      .click()
    const window = page.getByRole('dialog')
    await expect(window.getByRole('heading', { name: ACTIVITIES_STEP })).toBeVisible()
    await expect(window.getByText(activityTitle)).toBeVisible()
    await expect(window.getByText(generalNote)).toBeVisible()
    await expect(window.getByText('There are no current activities yet.')).toHaveCount(0)

    // "Close" leaves the step open and the page unchanged.
    await window.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(window).toBeHidden()
    await expect(page.getByRole('heading', { name: 'My work' })).toBeVisible()
  })

  test('a member with nothing to do sees the empty states, and /home passes axe', async ({
    page,
    context,
    baseURL,
  }) => {
    // The admin fixture is in none of the seeded groups and has no tasks.
    await loginAs(context, fixtureUser('admin'), baseURL ?? BASE)
    await page.goto('/home')
    const work = page.getByRole('region', { name: 'My work' })
    await expect(work.getByText('You have no open tasks.')).toBeVisible()
    await expect(
      work.getByText('You are not taking part in any current activity yet.'),
    ).toBeVisible()
    // Other people's work never shows here.
    await expect(work.getByText(taskTitle)).toHaveCount(0)
    await expect(work.getByText(activityTitle)).toHaveCount(0)
    await expectNoSeriousA11yViolations(page)
  })
})
