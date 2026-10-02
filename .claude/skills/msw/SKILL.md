---
name: msw
description: Mocking Tucker's /api in tests with MSW 3 — one typed handler set (openapi-msw) shared by Vitest (setupServer behind a Nuxt shim) and the mocked Playwright suite (@msw/playwright's network fixture), with a baseline User overridden per test and no request assertions. Use when writing or editing an API mock, a handler under frontend/test/mocks/, a test that overrides one with use(), or when moving a Vitest file off registerEndpoint or an e2e spec off page.route.
---

# MSW (Tucker)

Both mocked test layers answer `/api` from **one** set of [MSW](https://mswjs.io/) 3 handlers,
typed against `frontend/openapi/tucker.json`. Decision and alternatives:
[ADR 0034](../../../docs/adr/0034-api-mocks-are-one-msw-handler-set-and-tests-assert-what-the-user-sees.md).
The real-stack smokes are untouched — they hit the live backend.

## Where things live

| What | Where |
| --- | --- |
| Typed `http` (`createOpenApiHttp<paths>({ baseUrl: '*' })`) | `frontend/test/mocks/http.ts` |
| Baseline, one file per domain | `frontend/test/mocks/handlers/<domain>.ts`, joined in `index.ts` |
| Vitest opt-in: `useMswServer()` + `server` | `frontend/test/mocks/node.ts` |
| Playwright opt-in: `test` with a `network` fixture | `frontend/e2e/support/network.ts` |

The baseline is a neutral, consistent User, described in `handlers/index.ts`. Extend
it when a newly migrated surface reads a new endpoint — never bend it to suit one test.

## Quick start

```ts
// Vitest — top of the file, then override per test
import { http } from '~~/test/mocks/http'
import { server, useMswServer } from '~~/test/mocks/node'
useMswServer()

it('says the lookup did not get through', async () => {
  server.use(
    http.get('/api/check/{barcode}', ({ response }) =>
      response(503).json({ message: 'could not reach a nutrition source' }),
    ),
  )
  // render, act, assert what the User sees
})
```

```ts
// Playwright — import test/expect from the network support file
import { expect, test } from './support/network'
import { http } from '../test/mocks/http'

test('…', async ({ page, goto, network }) => {
  network.use(http.get('/api/summary', ({ query, response }) => /* … */))
})
```

Playwright cannot resolve `~~/`: import `test/mocks` relatively from `e2e/`, and keep
handlers free of app auto-imports (`localToday()` etc.) — pass such values in.

## Rules

1. **No request assertions.** Never capture a URL, query or body to assert on it. A query
   the page must send is answered only when it is right — a 400/409 otherwise, which the
   User meets as the error state. A mutation's handler keeps what it was sent and the test
   asserts the page after the re-read — or, where the page shows the response itself (a
   toast naming what was logged), derives that response from the body (`entryLog`
   scales a Food's per-100 g figures by the grams sent), so what the User reads proves
   what was sent. A fixed reply proves nothing about the body.
2. **Type every response.** `response(status).json(body)` checks the status against the
   spec and the body against that status' schema. `response.untyped(...)` only for a
   status the spec does not declare: an unexpected failure is
   `response.untyped(serverError())` (`test/mocks/http.ts`), whose doc says why it is
   untyped, so the call site needs no comment of its own.
3. **Override, don't redefine.** `use()` only the variation the test is about. A handler
   that returns `undefined` falls through to the next one — scope an override by param.
   A variation both layers need is a factory beside the baseline (`summaryWith(targets)`,
   `checkOnlyOn(day)`), never a copy per layer — the copies drift. A mutation re-read on
   its own endpoint is a factory returning a plain array with the state in a closure
   (`weightMeasurements`, and `foodCatalog`, which answers every endpoint of the
   catalog, its Tags and its barcode look-up from one state); one whose re-read lands
   on **another** endpoint returns
   `{ handlers, <state getter> }` (`reachedGoal`, `savedProfile`), and the other
   endpoint's handler reads the getter (`summaryOf(() => …)`). Never keep state in the
   baseline: it is shared across tests. Overriding a derived field overrides its inputs
   too — `setupComplete: false` with the baseline's reading still standing is a state the
   backend cannot send (it derives it from the Profile and the latest Weight
   Measurement) — and the test's comment is checked against the result.
4. **Error overrides are not `{ once: true }`** on a GET, unless the call passes `retry: 0`:
   ofetch retries a failed GET by itself, and the retry reaches the baseline, so the error
   never shows.
5. **Unhandled is a failure.** Both opt-ins fail the test on an `/api` request no handler
   covers — after it ends, so a page that caught the failed request still fails. That
   includes one an override matched and let fall through with nothing beneath it, which
   msw itself counts as handled and sends to the network: a terminal `fellThrough`
   handler (`test/mocks/http.ts`) catches it in both layers. Add the endpoint to the
   baseline (or the test) rather than loosening that.
6. **Overrides last one test.** `resetHandlers` runs after each test in Vitest, and the
   Playwright fixture is built per test, so a `use()` never leaks into the next.
7. **Prove each migrated test still goes red** by breaking its handler's response once, on a
   copy — Probity refuses hand-mutating a gated file. Save the output, naming each red test,
   on both Playwright projects, to a file the sign-off pack cites; re-run it after any later
   edit to the test or its handlers, since a stale script aborts on its first pattern.
   A response that never answers is a break too — it holds whatever the page awaits.
   Only a test decided by a setting seeded outside the API has no response to break:
   list it in the proof as such rather than inventing a break. How to run one:
   [REFERENCE.md, Red-proof runs](REFERENCE.md#red-proof-runs).

## Moving a file over

- [ ] Vitest: `useMswServer()`; replace each `registerEndpoint` with baseline or `server.use()`.
- [ ] e2e: import from `./support/network`; replace `page.route` on `/api` with baseline or
      `network.use()`. Non-API routes (a CDN abort, a fake camera) stay `page.route`.
- [ ] A stateful handler stands for the backend: before writing one, read the controller
      and repository behind each endpoint it answers — the status for an absent or
      foreign id, and the `ORDER BY` (SQLite's `lower()` folds ASCII alone). #403's mock
      got both wrong and only gates 3 and 4 caught it.
- [ ] Delete request-capturing arrays; assert the rendered result instead.
- [ ] Run green, then break each handler once and save the output naming each red test.

Why the shim exists, the fixture's internals, coexistence and every trap measured so far:
[REFERENCE.md](REFERENCE.md).
