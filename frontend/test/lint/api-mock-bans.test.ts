import { join } from 'node:path'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

// The bans in `eslint.config.mjs` that keep `/api` on the MSW handlers
// (ADR 0034), run against the real config. Their selectors are easy to break in
// either direction, so each refused form and each legal one is listed here.

const eslint = new ESLint({ cwd: join(__dirname, '..', '..') })

const BANS = new Set(['no-restricted-syntax', 'no-restricted-imports'])

/** What the bans report for [code] linted as if it lived at [filePath]. */
async function refusals(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath })
  const fatal = result!.messages.find((message) => message.fatal)
  if (fatal) throw new Error(`the sample does not parse: ${fatal.message}`)
  return result!.messages
    .filter((message) => message.ruleId && BANS.has(message.ruleId))
    .map((message) => message.message)
}

/** [statements] inside a test body of a mocked e2e spec. */
const mockedSpec = (statements: string) =>
  refusals(
    `import { test } from './support/test'\n\ntest('t', async ({ page, context }) => {\n${statements}\n})\n`,
    'e2e/lint-fixture.spec.ts',
  )

it('refuses to judge a sample that does not parse, which no ban would report', async () => {
  await expect(
    mockedSpec("await page.route('**/api/**' (r) => r.abort())"),
  ).rejects.toThrow(/does not parse/)
})

describe('the mocked e2e refuses a route() that would answer /api', () => {
  it.each([
    "await page.route('**/api/summary', (r) => r.abort())",
    "await page.route('**/api/**', (r) => r.abort())",
    'await context.route(/\\/api\\/goal/, (r) => r.abort())',
    'await page.route(/^\\/api/, (r) => r.abort())',
    'await page.route(/\\/(api|x)\\//, (r) => r.abort())',
    'await page.route(/.*api.*/, (r) => r.abort())',
    "await context.routeFromHAR('api.har', { url: '**/api/**' })",
    'await page.route(/\\/API\\//i, (r) => r.abort())',
    "await page.routeWebSocket('**/api/**', (ws) => ws.close())",
  ])('%s', async (line) => {
    expect(await mockedSpec(line)).toEqual([
      expect.stringContaining('Do not route /api in the mocked e2e'),
    ])
  })

  it.each([
    "await page.route('**/*', (r) => r.abort())",
    "await page.route('**', (r) => r.abort())",
    'await context.route(/.*/, (r) => r.abort())',
  ])('%s, which matches every URL', async (line) => {
    expect(await mockedSpec(line)).toEqual([
      expect.stringContaining('A route() matching every URL answers /api too'),
    ])
  })

  // The date helper has a config block of its own, which carries its own copy.
  it('in the e2e date helper too', async () => {
    const helper = `import type { Page } from '@playwright/test'\n\nexport const stub = (page: Page) => page.route('**/api/**', (r) => r.abort())\n`

    expect(await refusals(helper, 'e2e/support/date.ts')).toEqual([
      expect.stringContaining('Do not route /api in the mocked e2e'),
    ])
  })

  // Lint reads only what is written out, so a pattern it cannot read is refused
  // whatever it holds.
  it.each([
    "const pattern = '**/api/**'\nawait page.route(pattern, (r) => r.abort())",
    "await page.route((url) => url.pathname.startsWith('/api'), (r) => r.abort())",
    'await page.route(`**/*`, (r) => r.abort())',
    "await page['route']('**/api/**', (r) => r.abort())",
    "const method = 'route'\nawait page[method]('**/api/**', (r) => r.abort())",
    "await page.route.call(page, '**/api/**', (r) => r.abort())",
  ])('%s, which it cannot read', async (statements) => {
    expect(await mockedSpec(statements)).toContainEqual(
      expect.stringMatching(
        /so the \/api ban can (read it|see a route\(\) call)/,
      ),
    )
  })
})

describe('the mocked e2e leaves alone what does not route /api', () => {
  it.each([
    "await page.route('**jsdelivr.net/**', (r) => r.abort())",
    "await page.route('**/*.png', (r) => r.abort())",
    'await page.route(/googleapis\\.com/, (r) => r.abort())',
    'await page.route(/apiary\\.io/, (r) => r.abort())',
    "const fns = { go: () => {} }\nfns['go']()",
    'const state = { routes: [] as string[] }\nstate.routes.push(page.url())',
  ])('%s', async (statements) => {
    expect(await mockedSpec(statements)).toEqual([])
  })

  it('lets a real-stack smoke abort /api, which reaches the live backend', async () => {
    const smoke = `import { test } from './support/smoke-test'\n\ntest('t', async ({ page }) => {\n  await page.route('**/api/check/**', (r) => r.abort())\n})\n`

    expect(
      await refusals(smoke, 'e2e/smoke/lint-fixture.smoke.spec.ts'),
    ).toEqual([])
  })
})

describe('a test file refuses registerEndpoint', () => {
  it.each([
    'test/lint-fixture.test.ts',
    'app/components/LintFixture.test.ts',
    'server/routes/lint-fixture.test.ts',
    'e2e/support/lint-fixture.ts',
  ])('in %s', async (filePath) => {
    const code = `import { registerEndpoint } from '@nuxt/test-utils/runtime'\n\nregisterEndpoint('/api/me', () => ({}))\n`

    expect(await refusals(code, filePath)).toEqual([
      expect.stringContaining(
        'Mock /api with the MSW baseline or server.use()',
      ),
    ])
  })

  it('through a namespace import', async () => {
    const code = `import * as runtime from '@nuxt/test-utils/runtime'\n\nruntime.registerEndpoint('/api/me', () => ({}))\n`

    expect(await refusals(code, 'test/lint-fixture.test.ts')).toEqual([
      expect.stringContaining(
        'Mock /api with the MSW baseline or server.use()',
      ),
    ])
  })
})
