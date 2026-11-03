import { PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER } from 'next/constants'
import { describe, expect, it } from 'vitest'
import { parseEnv, validateEnv } from '@/lib/env'

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable-example',
  SUPABASE_SERVICE_ROLE_KEY: 'service-example',
}

describe('parseEnv', () => {
  it('accepts the required variables and leaves email ones optional', () => {
    expect(parseEnv(valid).RESEND_API_KEY).toBeUndefined()
  })

  it('names every missing variable but never prints a value', () => {
    const attempt = () => parseEnv({ SUPABASE_SERVICE_ROLE_KEY: 'secret-value-123' })
    expect(attempt).toThrow(/NEXT_PUBLIC_SUPABASE_URL/)
    expect(attempt).toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/)
    expect(attempt).not.toThrow(/secret-value-123/)
  })

  it('rejects a malformed URL', () => {
    expect(() => parseEnv({ ...valid, NEXT_PUBLIC_SUPABASE_URL: 'not a url' })).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL/,
    )
  })

  it('treats an empty value as missing', () => {
    expect(() => parseEnv({ ...valid, SUPABASE_SERVICE_ROLE_KEY: '' })).toThrow(
      /SUPABASE_SERVICE_ROLE_KEY/,
    )
  })
})

describe('validateEnv', () => {
  it('throws on an empty environment', () => {
    expect(() => validateEnv(PHASE_PRODUCTION_BUILD, {})).toThrow(/Invalid environment variables/)
  })

  it('can be skipped during the production build, for builds without secrets', () => {
    expect(() => validateEnv(PHASE_PRODUCTION_BUILD, { SKIP_ENV_VALIDATION: '1' })).not.toThrow()
  })

  it('ignores the skip flag when the server starts', () => {
    expect(() => validateEnv(PHASE_PRODUCTION_SERVER, { SKIP_ENV_VALIDATION: '1' })).toThrow(
      /Invalid environment variables/,
    )
  })
})
