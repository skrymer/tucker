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
  // Prettier owns formatting; switch off ESLint rules that would conflict.
  eslintConfigPrettier,
)
