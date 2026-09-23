// Build the app once for the mocked Playwright e2e suite, into its own
// directory, which playwright.config.ts then serves to every worker.
//
// Built from nuxt.config.ts as it stands rather than through @nuxt/test-utils,
// which overrides `compatibilityDate` with its own.
import { rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { buildNuxt, loadNuxt } from 'nuxt/kit'

const rootDir = fileURLToPath(new URL('..', import.meta.url))
const buildDir = fileURLToPath(new URL('../.nuxt/e2e', import.meta.url))

// Cleared first, so nothing of a previous build survives into this one.
await rm(buildDir, { recursive: true, force: true })
const nuxt = await loadNuxt({
  cwd: rootDir,
  dev: false,
  overrides: { buildDir, nitro: { output: { dir: `${buildDir}/output` } } },
})
await buildNuxt(nuxt)
await nuxt.close()
