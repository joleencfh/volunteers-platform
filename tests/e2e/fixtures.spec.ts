import { expect, test } from '@playwright/test'
import { FIXTURE_USERS } from '../fixtures/users'
import { supabaseEnv } from '../helpers/supabase'
import { loginAs } from './helpers/auth'

test.skip(!supabaseEnv(), 'needs Supabase settings (runs in CI)')

for (const user of FIXTURE_USERS) {
  test(`fixture user "${user.key}" can sign in and carries the right level`, async ({
    context,
    baseURL,
  }) => {
    const { client } = await loginAs(context, user, baseURL ?? 'http://localhost:3000')

    const { data, error } = await client.auth.getUser()
    expect(error).toBeNull()
    expect(data.user?.email).toBe(user.email)
    expect(data.user?.app_metadata.level).toBe(user.level)
    expect(data.user?.app_metadata.is_admin).toBe(user.isAdmin)
    expect((await context.cookies()).length).toBeGreaterThan(0)
  })
}
