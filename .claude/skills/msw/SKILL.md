---
name: msw
description: Mocking Tucker's /api in tests with MSW 3 — one typed handler set (openapi-msw) shared by Vitest (setupServer behind a Nuxt shim) and the mocked Playwright suite (@msw/playwright's network fixture), with a baseline User overridden per test and no request assertions. Use when writing or editing an API mock, a handler under frontend/test/mocks/, or a test that overrides one with use(). Never registerEndpoint or page.route for /api — ESLint refuses both.
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
| Vitest `server`, installed for every file by `test/setup.ts` | `frontend/test/mocks/node.ts` |
| Playwright `test` (`support/test.ts`) with the auto `network` fixture | `frontend/e2e/support/network.ts` |

The baseline is a neutral, consistent User, described in `handlers/index.ts`. Extend
it when a surface starts reading a new endpoint — never bend it to suit one test.

## Quick start

```ts
// Vitest — the baseline already answers; override per test
import { http } from '~~/test/mocks/http'
import { server } from '~~/test/mocks/node'

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
// Playwright — the mocked suite's own test/expect
import { expect, test } from './support/test'
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
   what was sent. A fixed reply proves nothing about the body. A field the page sends
   and never shows (a zone, a push device) is accepted only when it is the right one
   (`savedProfile`'s `timezone`, `pushServiceFor`). A windowed read
   (`?from=&to=`) is answered per width and only for a window ending on the day the
   test passes in (`intakeBreakdownByPeriod`, `weightTimelineByWidth`), and the test
   asserts each window's own content.
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
   catalog, its Recipes, its Tags and its barcode look-up from one state, and
   `bodyAndPlan`, which does the same for the Profile, the readings and the Goals); one whose re-read lands
   on **another** endpoint returns
   `{ handlers, <state getter> }` (`reachedGoal`, `savedProfile`), and the other
   endpoint's handler reads the getter (`summaryOf(() => …)`) — or, where the state
   lives in a plain-array factory, reads it through that factory's own read with
   `getResponse` (`micronutrientIntakeOver(catalog, …)`). Never keep state in the
   baseline: it is shared across tests. Overriding a derived field overrides its inputs
   too — `setupComplete: false` with the baseline's reading still standing is a state the
   backend cannot send (it derives it from the Profile and the latest Weight
   Measurement), and a Weight Timeline naming a plan needs `goalInProgress()` beside
   it — and the test's comment is checked against the result. The baseline's own
   derived figures (a Budget, a Floor, a seed Maintenance) are computed from its own
   Profile and reading, with the derivation in the doc comment
   (`baselineCalorieBudget`), and that includes a literal a new handler inherits from
   an older one: #405's first review carried an underived 2492 kcal / 170 g.
4. **Error overrides are not `{ once: true }`** on a GET, unless the call passes `retry: 0`:
   ofetch retries a failed GET by itself, and the retry reaches the baseline, so the error
   never shows.
5. **Unhandled is a failure.** Both layers fail the test on an `/api` request no handler
   covers — after it ends, so a page that caught the failed request still fails. That
   includes one an override matched and let fall through with nothing beneath it, which
   msw itself counts as handled and sends to the network: a terminal `fellThrough`
   handler (`test/mocks/http.ts`) catches it in both layers. Add the endpoint to the
   baseline (or the test) rather than loosening that. Never mock `/api` with
   `registerEndpoint` or `page.route`: neither reaches that check, and ESLint refuses
   both (`eslint.config.mjs`). In the mocked e2e a `route()` pattern must be a literal
   that does not match every URL, so the ban can read it. A fixture serving the app
   from a real origin of its own switches the handlers off while it lives
   (`expiredAccessOrigin`). A `page.route` on another host (a CDN abort, a fake camera)
   is fine, and the smokes never use the handlers.
6. **Overrides last one test.** `resetHandlers` runs after each test in Vitest, and the
   Playwright fixture is built per test, so a `use()` never leaks into the next.
7. **Prove each new or changed test still goes red** by breaking its handler's response
   once, on a copy — Probity refuses hand-mutating a gated file. Save the output, naming
   each red test, on both Playwright projects, to a file the sign-off pack cites. Build
   the harness during the slice, but start the run the pack cites only once gate 3/4's
   fixes have landed and every gate-3/4 agent has returned: gate 1 edits handlers, so an
   earlier run is always superseded (#405 ran it twice, ~38 minutes each). Any later edit
   means another run.
   A response that never answers is a break too — it holds whatever the page awaits.
   Only a test decided by a setting seeded outside the API has no response to break:
   list it in the proof as such rather than inventing a break. How to run one:
   [REFERENCE.md, Red-proof runs](REFERENCE.md#red-proof-runs).

## Changing a handler

- A stateful handler stands for the backend: before writing one, read the controller
  and repository behind each endpoint it answers — the status for an absent or
  foreign id, the order its refusals are checked in, and the `ORDER BY` — per
  query, not per table (SQLite's `lower()` folds ASCII alone; a bare `ORDER BY`
  compares bytes).
- Before deleting a request count, name the client regression it caught (a retry, a
  missing re-ask, a second read) and check the replacement shows that one on
  screen: a handler break cannot, since it changes the server, not the client.
- Run green, then break each handler once and save the output naming each red test.

Why the shim exists, the fixture's internals and every trap measured so far:
[REFERENCE.md](REFERENCE.md).
