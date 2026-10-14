// Safety guard: test suites create and delete users and rows, so they must only ever run against a
// local database. Staging and production are off limits unless someone sets ALLOW_REMOTE_TESTS=1.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1', 'host.docker.internal'])

export function isLocalTarget(value: string): boolean {
  try {
    // Connection strings and API URLs both parse once they have a scheme
    const url = new URL(value.includes('://') ? value : `postgresql://${value}`)
    return LOCAL_HOSTS.has(url.hostname)
  } catch {
    return false
  }
}

export function assertLocalTarget(
  name: string,
  value: string | undefined,
  env: Record<string, string | undefined> = process.env,
): void {
  if (!value || env.ALLOW_REMOTE_TESTS === '1') return
  if (isLocalTarget(value)) return
  throw new Error(
    `${name} does not point at a local database, and tests create and delete data. ` +
      'Refusing to run. Use local Supabase (CI does), or set ALLOW_REMOTE_TESTS=1 if you are ' +
      'certain this is a throwaway database.',
  )
}
