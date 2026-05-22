// Flat ESLint config. `withNuxt` layers in Nuxt's project-aware rules
// (generated into .nuxt/eslint.config.mjs by `nuxt prepare`).
import withNuxt from './.nuxt/eslint.config.mjs'
import eslintConfigPrettier from 'eslint-config-prettier'

export default withNuxt(
  // Prettier owns formatting; switch off ESLint rules that would conflict.
  eslintConfigPrettier,
)
