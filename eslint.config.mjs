import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    // Generated files (e.g. lib/database.types.ts from `supabase gen types`, added in F-02)
    // are machine-written and not candidates for splitting.
    ignores: ['lib/database.types.ts'],
    rules: {
      // Nudge oversized files toward being split into smaller modules. A warning, not an
      // error. Blank lines and comments do not count.
      'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores(['.next/**', 'out/**', 'build/**', 'coverage/**', 'next-env.d.ts']),
])

export default eslintConfig
