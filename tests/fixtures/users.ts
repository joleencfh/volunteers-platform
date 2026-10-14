// Synthetic users used by database and end-to-end tests. Emails use the reserved .test domain.
// Passwords are never stored here: the E2E global setup generates one per run.
export type Level = 'new' | 'fresh' | 'experienced'

export type FixtureUser = {
  key: 'new' | 'fresh' | 'experienced' | 'admin'
  email: string
  level: Level
  isAdmin: boolean
}

export const FIXTURE_USERS: readonly FixtureUser[] = [
  { key: 'new', email: 'e2e-new@example.test', level: 'new', isAdmin: false },
  { key: 'fresh', email: 'e2e-fresh@example.test', level: 'fresh', isAdmin: false },
  {
    key: 'experienced',
    email: 'e2e-experienced@example.test',
    level: 'experienced',
    isAdmin: false,
  },
  { key: 'admin', email: 'e2e-admin@example.test', level: 'experienced', isAdmin: true },
]

export function fixtureUser(key: FixtureUser['key']): FixtureUser {
  const user = FIXTURE_USERS.find((candidate) => candidate.key === key)
  if (!user) throw new Error(`Unknown fixture user: ${key}`)
  return user
}
