// Tasks: create, take, assign, complete, reopen and My tasks (story T-04, part 1). Needs a local
// Supabase, so it runs in CI. Assertions check the resulting state, not transient messages, and use
// exact locators where words repeat ("Done" is also part of other texts).
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

test.describe('tasks', () => {
  const suffix = randomUUID().slice(0, 8)
  const slug = `e2e-tasks-${suffix}`
  const activityTitle = `Task activity ${suffix}`
  const titles = {
    unassigned: `Unassigned task ${suffix}`,
    forNewcomer: `Task for a newcomer ${suffix}`,
    ofFresh: `Task of a fresh member ${suffix}`,
    finished: `Finished task ${suffix}`,
    created: `Created in the form ${suffix}`,
  }
  let groupId = ''
  let activityId = ''
  let experiencedName = ''
  let newcomerName = ''

  test.beforeAll(async () => {
    const db = adminClient()
    const group = await db
      .from('working_groups')
      .insert({ slug, name: `E2E Tasks ${suffix}`, description: `Synthetic ${suffix}.` })
      .select('id')
      .single()
    if (group.error) throw group.error
    groupId = group.data.id
    const fresh = await userOf(fixtureUser('fresh'))
    const newcomer = await userOf(fixtureUser('new'))
    const experienced = await userOf(fixtureUser('experienced'))
    experiencedName = experienced.display_name
    newcomerName = newcomer.display_name
    const members = await db
      .from('wg_members')
      .insert(
        [fresh.id, newcomer.id, experienced.id].map((user_id) => ({ group_id: groupId, user_id })),
      )
    if (members.error) throw members.error

    const activity = await db
      .from('activities')
      .insert({
        group_id: groupId,
        type: 'campaign',
        title: activityTitle,
        status: 'active',
        details: { message: `Message ${suffix}` },
        created_by: experienced.id,
      })
      .select('id')
      .single()
    if (activity.error) throw activity.error
    activityId = activity.data.id

    const tasks = await db.from('tasks').insert([
      {
        activity_id: activityId,
        group_id: groupId,
        title: titles.unassigned,
        created_by: experienced.id,
      },
      {
        activity_id: activityId,
        group_id: groupId,
        title: titles.forNewcomer,
        created_by: experienced.id,
      },
      {
        activity_id: activityId,
        group_id: groupId,
        title: titles.ofFresh,
        assignee_id: fresh.id,
        created_by: experienced.id,
      },
      {
        activity_id: activityId,
        group_id: groupId,
        title: titles.finished,
        assignee_id: fresh.id,
        status: 'done',
        completion_note: 'Seeded as finished',
        created_by: experienced.id,
      },
    ])
    if (tasks.error) throw tasks.error
  })

  test.afterAll(async () => {
    // Activities and tasks go with the group (on delete cascade).
    await adminClient().from('working_groups').delete().eq('id', groupId)
  })

  const open = async (page: Page) => {
    await page.goto(`/groups/${slug}/activities/${activityId}`)
    await expect(page.getByRole('heading', { name: activityTitle, level: 1 })).toBeVisible()
  }
  const row = (page: Page, title: string) =>
    page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: title }) })

  test('a fresh member creates a task and assigns it to a member of the group', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, fixtureUser('fresh'), baseURL ?? BASE)
    await open(page)
    await expectNoSeriousA11yViolations(page)

    const form = page
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Create task' }) })
    await form.getByLabel('Title', { exact: true }).fill(titles.created)
    await form.getByLabel('Assignee', { exact: true }).selectOption({ label: experiencedName })
    await form.getByRole('button', { name: 'Create task' }).click()

    await expect(row(page, titles.created)).toBeVisible()
    await expect(
      row(page, titles.created).getByText(`Assigned to ${experiencedName}`),
    ).toBeVisible()
  })

  test('a new volunteer has no create form but takes a task and completes it with a note', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, fixtureUser('new'), baseURL ?? BASE)
    await open(page)
    await expect(page.getByRole('heading', { name: 'Add a task' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Create task' })).toHaveCount(0)

    await row(page, titles.forNewcomer).getByRole('button', { name: 'Take this task' }).click()
    await expect(
      row(page, titles.forNewcomer).getByText(`Assigned to ${newcomerName}`),
    ).toBeVisible()

    // It is now in My tasks.
    await page.goto('/tasks')
    await expect(page.getByRole('heading', { name: titles.forNewcomer })).toBeVisible()
    await expectNoSeriousA11yViolations(page)

    await open(page)
    const mine = row(page, titles.forNewcomer)
    await mine.getByText('Complete this task', { exact: true }).click()
    // A note or a link is needed: the button is there, the note makes it valid.
    await mine.getByLabel('Completion note').fill('Sent the letter by post')
    await mine.getByRole('button', { name: 'Mark as done' }).click()
    await expect(mine.getByText('Completion note: Sent the letter by post')).toBeVisible()
    await expect(mine.getByText('Done', { exact: true })).toBeVisible()

    // A completed task leaves My tasks.
    await page.goto('/tasks')
    await expect(page.getByRole('heading', { name: 'My tasks', level: 1 })).toBeVisible()
    await expect(page.getByRole('heading', { name: titles.forNewcomer })).toHaveCount(0)
  })

  test('a member who is not the assignee cannot complete the task', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, fixtureUser('experienced'), baseURL ?? BASE)
    await open(page)
    const theirs = row(page, titles.ofFresh)
    await expect(theirs).toBeVisible()
    await expect(theirs.getByText('Complete this task', { exact: true })).toHaveCount(0)
    await expect(theirs.getByRole('button', { name: 'Mark as done' })).toHaveCount(0)
    // An experienced member may still reassign it.
    await expect(theirs.getByRole('button', { name: 'Assign', exact: true })).toBeVisible()
  })

  test('the assignee sees the completion form and a fresh member cannot take an assigned task', async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, fixtureUser('fresh'), baseURL ?? BASE)
    await open(page)
    await expect(
      row(page, titles.ofFresh).getByText('Complete this task', { exact: true }),
    ).toBeVisible()
    await expect(
      row(page, titles.ofFresh).getByRole('button', { name: 'Take this task' }),
    ).toHaveCount(0)
    // A done task offers no controls to its assignee.
    await expect(
      row(page, titles.finished).getByRole('button', { name: 'Reopen task' }),
    ).toHaveCount(0)
  })

  test('the Tasks tab filters by assignee', async ({ page, context, baseURL }) => {
    await loginAs(context, fixtureUser('fresh'), baseURL ?? BASE)
    await page.goto(`/groups/${slug}?tab=tasks&assignee=unassigned`)
    await expect(page.getByRole('heading', { name: titles.unassigned })).toBeVisible()
    await expect(page.getByRole('heading', { name: titles.ofFresh })).toHaveCount(0)

    await page.goto(`/groups/${slug}?tab=tasks&assignee=me`)
    await expect(page.getByRole('heading', { name: titles.ofFresh })).toBeVisible()
    await expect(page.getByRole('heading', { name: titles.unassigned })).toHaveCount(0)
  })

  test('only an admin reopens a done task', async ({ page, context, baseURL }) => {
    await loginAs(context, fixtureUser('admin'), baseURL ?? BASE)
    await open(page)
    const finished = row(page, titles.finished)
    await expect(finished.getByText('Done', { exact: true })).toBeVisible()
    await finished.getByRole('button', { name: 'Reopen task' }).click()

    // The task is open again: the reopen control is gone and the badge says Open.
    await expect(finished.getByRole('button', { name: 'Reopen task' })).toHaveCount(0)
    await expect(finished.getByText('Open', { exact: true })).toBeVisible()
  })
})
