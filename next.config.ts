import type { NextConfig } from 'next'
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER,
} from 'next/constants'
import { validateEnv } from './lib/env'
import { securityHeaders } from './lib/security-headers'

const nextConfig = (isDev: boolean): NextConfig => ({
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders({ supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, isDev }),
      },
    ]
  },
})

export default function config(phase: string): NextConfig {
  // Fail fast on a missing variable when building or serving. `next typegen` (the typecheck
  // script) loads the config in the build phase too, but needs no secrets, so it is exempt.
  const isTypegen = process.argv.includes('typegen')
  if ((phase === PHASE_PRODUCTION_BUILD || phase === PHASE_PRODUCTION_SERVER) && !isTypegen) {
    validateEnv(phase)
  }
  return nextConfig(phase === PHASE_DEVELOPMENT_SERVER)
}
