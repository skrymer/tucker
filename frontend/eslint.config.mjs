// Flat ESLint config. `withNuxt` layers in Nuxt's project-aware rules
// (generated into .nuxt/eslint.config.mjs by `nuxt prepare`).
import withNuxt from './.nuxt/eslint.config.mjs'
import eslintConfigPrettier from 'eslint-config-prettier'
import tsParser from '@typescript-eslint/parser'

// `no-restricted-syntax` is one rule, so a later config object matching a file
// replaces an earlier one's selectors rather than adding to them. Each group of
// files below therefore lists every selector set that applies to it.

// A focused test is never something to commit: `.only` silently reduces the
// suite to itself while every runner still reports green, so the gate keeps
// passing over code nothing ran against. `.skip` is deliberately NOT banned —
// Playwright's `test.skip(condition, reason)` is a legitimate runtime guard, and
// e2e/intake-breakdown.spec.ts uses it to hold a touch test to the Mobile Chrome
// project.
const noFocusedTests = [
  {
    selector:
      "CallExpression[callee.object.name=/^(test|it|describe|suite)$/][callee.property.name='only']",
    message:
      'Do not commit a focused test (.only) — it shrinks the suite to itself while CI still reports green.',
  },
  {
    selector:
      "CallExpression[callee.object.property.name='describe'][callee.property.name='only']",
    message:
      'Do not commit a focused test (test.describe.only) — it shrinks the suite to itself while CI still reports green.',
  },
]

// Date construction in e2e/ has a single home: e2e/support/date.ts.
// Banning hand-rolled `toLocaleDateString` and bare `new Date()` elsewhere keeps
// the suite's "today" explicit-UTC, so determinism no longer leans on the
// process timezone.
const noLocalTzDates = [
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
]

// The mocked suite answers `/api` from the shared MSW handlers (ADR 0034), whose
// unhandled-request check a `route()` on `/api` would go around. A lint rule can
// only read what is written out, so `route()` is called by name, directly, with a
// plain string or regex literal, and that literal may neither name `/api` nor be
// a catch-all; a HAR replay is refused outright. This is a guard against the
// usual ways of writing one, not a proof: a pattern built to slip past it will.
// A route on anything else — a CDN abort, a fake camera — stays legal, as does
// the smokes' offline abort against the real backend.
const API_ROUTE_MESSAGE =
  'Do not route /api in the mocked e2e — answer it with the MSW baseline or network.use() (the msw skill, ADR 0034).'
const READABLE_MESSAGE =
  'Call route() by name with a plain string or regex literal in the mocked e2e, so the /api ban can read it (the msw skill, ADR 0034).'
const CATCH_ALL_MESSAGE =
  'A route() matching every URL answers /api too — name the host or path it is for (the msw skill, ADR 0034).'
const ROUTE_CALL = 'CallExpression[callee.property.name=/^route(WebSocket)?$/]'
const API_PATH = '/\\/api(\\/|\\*|\\?|$)/'
const noApiRoutes = [
  {
    selector: `${ROUTE_CALL} > Literal.arguments:first-child[value=${API_PATH}]`,
    message: API_ROUTE_MESSAGE,
  },
  {
    selector: `${ROUTE_CALL} > Literal.arguments:first-child[regex.pattern=/(^|\\W)api\\b/i]`,
    message: API_ROUTE_MESSAGE,
  },
  {
    selector: `${ROUTE_CALL} > Literal.arguments:first-child[value=/^\\*{1,2}(\\/\\*{1,2})?$/]`,
    message: CATCH_ALL_MESSAGE,
  },
  {
    selector: `${ROUTE_CALL} > Literal.arguments:first-child[regex.pattern=/^\\^?\\.[*+]\\$?$/]`,
    message: CATCH_ALL_MESSAGE,
  },
  {
    selector: `${ROUTE_CALL} > .arguments:first-child:not(Literal)`,
    message: READABLE_MESSAGE,
  },
  {
    selector:
      'CallExpression[callee.computed=true]:matches([callee.property.value=/^route/], [callee.property.quasis.0.value.raw=/^route/])',
    message: READABLE_MESSAGE,
  },
  {
    // A computed key that is not written out could be `route`.
    selector:
      "CallExpression[callee.computed=true]:not([callee.property.type='Literal'], TemplateLiteral[expressions.length=0].callee.property)",
    message:
      'Call a method through a written-out key in the mocked e2e, so the /api ban can see a route() call (the msw skill, ADR 0034).',
  },
  {
    selector:
      'CallExpression[callee.object.property.name=/^route(FromHAR)?$/][callee.property.name=/^(call|apply|bind)$/]',
    message: READABLE_MESSAGE,
  },
  {
    selector: "CallExpression[callee.property.name='routeFromHAR']",
    message: API_ROUTE_MESSAGE,
  },
]

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
    name: 'tucker/no-focused-tests',
    files: ['**/*.test.ts', '**/*.spec.ts'],
    languageOptions: {
      parser: tsParser,
    },
    rules: {
      'no-restricted-syntax': ['error', ...noFocusedTests],
    },
  },
  {
    name: 'tucker/e2e-mocked',
    files: ['e2e/**/*.ts'],
    ignores: ['e2e/support/date.ts', 'e2e/smoke/**'],
    languageOptions: {
      parser: tsParser,
    },
    rules: {
      'no-restricted-syntax': [
        'error',
        ...noFocusedTests,
        ...noLocalTzDates,
        ...noApiRoutes,
      ],
    },
  },
  {
    // The date helper is the one e2e file allowed to construct dates.
    name: 'tucker/e2e-date-helper',
    files: ['e2e/support/date.ts'],
    languageOptions: {
      parser: tsParser,
    },
    rules: {
      'no-restricted-syntax': ['error', ...noFocusedTests, ...noApiRoutes],
    },
  },
  {
    name: 'tucker/e2e-smoke',
    files: ['e2e/smoke/**/*.ts'],
    languageOptions: {
      parser: tsParser,
    },
    rules: {
      'no-restricted-syntax': ['error', ...noFocusedTests, ...noLocalTzDates],
    },
  },
  {
    // Nuxt's endpoint registry answers a path ahead of the MSW handlers and
    // outside their unhandled-request check (ADR 0034).
    name: 'tucker/no-register-endpoint',
    files: ['**/*.test.ts', '**/*.spec.ts', 'test/**/*.ts', 'e2e/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@nuxt/test-utils/runtime',
              importNames: ['registerEndpoint'],
              message:
                'Mock /api with the MSW baseline or server.use() (the msw skill, ADR 0034).',
            },
          ],
        },
      ],
    },
  },
  // Prettier owns formatting; switch off ESLint rules that would conflict.
  eslintConfigPrettier,
)
