import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Database tests: need local Supabase (see scripts/test-db.ts). CI runs them on every pull request.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['tests/db/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Tests share one database, so run files one after another
    fileParallelism: false,
  },
})
