import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Unit tests: pure logic, no network and no database. Database tests use vitest.db.config.mts.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // Business rules live in lib/domain and must stay well covered.
      include: ['lib/domain/**/*.ts'],
      reporter: ['text', 'lcov'],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 },
    },
  },
})
