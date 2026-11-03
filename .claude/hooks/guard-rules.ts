// Pure rules behind the PreToolUse file guard (guard-files.ts). Kept free of I/O so they are unit
// tested in tests/unit/guard-rules.test.ts. Returns a message when the edit must be blocked.
export type GuardEnv = Record<string, string | undefined>

const ENV_TEMPLATES = new Set(['.env.schema', '.env.example'])

export function checkPath(
  relPath: string,
  isCommitted: (relPath: string) => boolean,
  env: GuardEnv = {},
): string | null {
  const path = relPath.replace(/\\/g, '/')
  const base = path.split('/').pop() ?? path

  if (/^\.env(\..+)?$/.test(base) && !ENV_TEMPLATES.has(base)) {
    return `${path} may hold secrets and must never be written by an assistant. Declare variables in .env.schema and let the maintainer set values locally.`
  }

  if (/\.(csv|xlsx)$/i.test(path) && !path.startsWith('tests/fixtures/')) {
    return `${path}: data files may contain real personal data and this repository is public. Only synthetic fixtures under tests/fixtures/ may be created.`
  }

  if (
    /^supabase\/migrations\/.+\.sql$/.test(path) &&
    env.ALLOW_MIGRATION_EDIT !== '1' &&
    isCommitted(path)
  ) {
    return `${path} is already committed, so it may have been applied. Never edit an applied migration: create a new one with "bunx supabase migration new <name>". If this migration was truly never applied anywhere, the maintainer can start Claude Code with ALLOW_MIGRATION_EDIT=1.`
  }

  return null
}
