// Flat ESLint config. `withNuxt` layers in Nuxt's project-aware rules
// (generated into .nuxt/eslint.config.mjs by `nuxt prepare`).
import withNuxt from './.nuxt/eslint.config.mjs'
import eslintConfigPrettier from 'eslint-config-prettier'
import tsParser from '@typescript-eslint/parser'

export default withNuxt(
  {
    // Parse <script lang="ts"> in .vue files as TypeScript — vue-eslint-parser
    // needs the TypeScript parser handed to it explicitly.
    name: 'tucker/vue-script-typescript',
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tsParser },
    },
  },
  {
    // Nuxt's `app/pages` routing config resets the parser to espree for
    // non-.vue files in the dir, which breaks co-located `.ts` page tests.
    // Hand those back to the TypeScript parser.
    name: 'tucker/pages-typescript',
    files: ['app/pages/**/*.ts'],
    languageOptions: {
      parser: tsParser,
    },
  },
  {
    // Date construction in e2e/ has a single home: e2e/support/date.ts (issue
    // #85). Banning hand-rolled `toLocaleDateString` and bare `new Date()`
    // elsewhere keeps the suite's "today" explicit-UTC, so determinism no longer
    // leans on the process timezone. The helper module itself is exempt.
    name: 'tucker/e2e-no-local-tz-dates',
    files: ['e2e/**/*.ts'],
    ignores: ['e2e/support/date.ts'],
    languageOptions: {
      parser: tsParser,
    },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='toLocaleDateString']",
          message:
            'Do not format dates with toLocaleDateString in e2e/ (timezone-dependent). Use todayIso()/formatDmy() from e2e/support/date.ts.',
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message:
            'Do not construct dates with a bare new Date() in e2e/ (timezone-dependent). Use todayIso() from e2e/support/date.ts.',
        },
      ],
    },
  },
  // Prettier owns formatting; switch off ESLint rules that would conflict.
  eslintConfigPrettier,
)
