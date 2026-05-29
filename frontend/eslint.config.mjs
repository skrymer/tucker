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
  // Prettier owns formatting; switch off ESLint rules that would conflict.
  eslintConfigPrettier,
)
