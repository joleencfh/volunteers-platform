import { Linter } from 'eslint'
import { describe, expect, it } from 'vitest'
import plugin from '../../eslint-rules/no-server-only-in-client.mjs'

const linter = new Linter()
const config = [
  {
    files: ['**/*.ts'],
    plugins: { local: plugin },
    rules: { 'local/no-server-only-in-client': 'error' as const },
  },
]

const lint = (code: string) => linter.verify(code, config, 'component.ts')

describe('local/no-server-only-in-client', () => {
  it.each([
    "import 'server-only'",
    "import { createAdminClient } from '@/lib/supabase/admin'",
    "import { sendEmail } from '@/lib/email/resend'",
    "import { recordAudit } from '@/lib/audit'",
    "import { recordAudit } from '../../lib/audit/record'",
  ])('reports %s in a client component', (statement) => {
    const messages = lint(`'use client'\n${statement}\n`)
    expect(messages).toHaveLength(1)
    expect(messages[0].message).toMatch(/server-only/)
  })

  it('allows the same imports in a server component', () => {
    expect(lint("import 'server-only'\nimport { recordAudit } from '@/lib/audit'\n")).toEqual([])
  })

  it('allows ordinary imports in a client component', () => {
    expect(lint("'use client'\nimport { useState } from 'react'\n")).toEqual([])
  })

  it('does not treat a later string statement as the directive', () => {
    expect(lint("import 'react'\n'use client'\nimport 'server-only'\n")).toEqual([])
  })
})
