import { describe, expect, it } from 'vitest'
import { checkPath } from '../../.claude/hooks/guard-rules'

const committed = (paths: string[]) => (rel: string) => paths.includes(rel)
const none = committed([])

describe('Claude Code file guard: migrations', () => {
  const existing = 'supabase/migrations/20261011151604_helpers.sql'

  it('blocks editing a migration that is already committed', () => {
    expect(checkPath(existing, committed([existing]))).toMatch(/never edit an applied migration/i)
  })

  it('allows creating a new migration that is not committed yet', () => {
    expect(checkPath('supabase/migrations/20270101000000_new.sql', none)).toBeNull()
  })

  it('allows editing a committed migration only with ALLOW_MIGRATION_EDIT=1', () => {
    expect(checkPath(existing, committed([existing]), { ALLOW_MIGRATION_EDIT: '1' })).toBeNull()
  })

  it('does not touch other files in the supabase folder', () => {
    expect(checkPath('supabase/config.toml', committed(['supabase/config.toml']))).toBeNull()
  })
})

describe('Claude Code file guard: env files', () => {
  it.each(['.env', '.env.local', '.env.production', 'app/.env.staging'])('blocks %s', (file) => {
    expect(checkPath(file, none)).toMatch(/secrets/)
  })

  it.each(['.env.schema', '.env.example'])('allows the template %s', (file) => {
    expect(checkPath(file, none)).toBeNull()
  })
})

describe('Claude Code file guard: data files', () => {
  it.each(['targets.csv', 'exports/people.xlsx', 'docs/real.CSV'])('blocks %s', (file) => {
    expect(checkPath(file, none)).toMatch(/public/)
  })

  it('allows synthetic fixtures', () => {
    expect(checkPath('tests/fixtures/organisations.csv', none)).toBeNull()
  })

  it('normalises Windows path separators', () => {
    expect(checkPath('exports\\people.csv', none)).toMatch(/public/)
  })
})

describe('Claude Code file guard: ordinary files', () => {
  it.each(['app/page.tsx', 'lib/domain/week.ts', 'docs/runbook.md'])('allows %s', (file) => {
    expect(checkPath(file, none)).toBeNull()
  })
})
