# MSW in Tucker — reference

Upstream docs: [mswjs.io](https://mswjs.io/) — [Node.js integration](https://mswjs.io/docs/integrations/node),
[best practices](https://mswjs.io/docs/best-practices/structuring-handlers),
[avoid request assertions](https://mswjs.io/docs/best-practices/avoid-request-assertions),
[network behavior overrides](https://mswjs.io/docs/best-practices/network-behavior-overrides),
[`@msw/playwright`](https://github.com/mswjs/playwright), [`openapi-msw`](https://github.com/christoph-fricke/openapi-msw).

## msw 3 names

- `server.listen({ onUnhandledFrame: 'error' })` — msw 3's name for what msw 2 called
  `onUnhandledRequest`.
- A custom `onUnhandledFrame` callback's `defaults.error()` **only prints**; it does not fail
  the frame. Tucker's callbacks record the request and throw: in Node, msw answers a
  throwing callback with `500 Unhandled Exception`, so the page meets an error, and the
  recorded list fails the test after it ends (`assertNoUnhandledRequests` in Vitest, the
  fixture's teardown in Playwright).

## Vitest: why stock `setupServer` needs a shim

Under `environment: 'nuxt'` (happy-dom) two things stop it, independently:

1. `@nuxt/test-utils` wraps `fetch` (`createFetchForH3V2` in
   `node_modules/@nuxt/test-utils/dist/runtime/shared/h3-v2.mjs`): a **relative** URL that
   `registerEndpoint` did not register answers `404 Not Found` without reaching the network,
   so MSW never sees it.
2. msw 3's fetch interceptor (`@mswjs/interceptors` `lib/node/interceptors/fetch/node.js`)
   builds `new Request(...)` from the global — happy-dom's — and passes it to the real
   `fetch`, intercepting beneath it. Node's `fetch` cannot read a foreign `Request`: "Failed to
   parse URL from [object Request]".

`useMswServer()` (in `beforeAll`): wrap `fetch` to unwrap a `Request` into URL + init, then
`server.listen`, then rebind `$fetch` with `createFetch({ fetch, defaults: { baseURL:
location.origin } })` so relative `/api/*` becomes absolute and reaches the interceptor. It
restores both in `afterAll`, so an unmigrated file is untouched. `useNuxtApp().$api` reads
`globalThis.$fetch` per call, so it follows the rebind.

The unwrap cannot hand on the `Request`'s `signal` — Node's `fetch` refuses happy-dom's
`AbortSignal` by brand check, failing every request — so the shim races the response
against it instead. An aborted read rejects as it would in a browser, which
`useOptionalFetch` and `useWindowedFetch` rely on when they supersede one.

Each part is pinned by `test/mocks/node.test.ts`: without the unwrap all seven tests fail,
without the rebind six do, without the registry branch the coexistence test does.

Measured and rejected: jsdom (54 tests in 5 files fail, and relative URLs still need the
rebind), nuxt-msw (msw 2 only, unpublished since 2024-11), a `getResponse` bridge (works, but
reimplements `use` / `resetHandlers` / `once`).

## Playwright: the `network` fixture

`defineNetworkFixture({ context, handlers, onUnhandledFrame })` routes **every** request of
the context through `context.route`, not a service worker — so no `mockServiceWorker.js`
ships and the Workbox SW (ADR 0011) is the only worker. `skipAssetRequests` (default on)
lets JS/CSS/HTML fall through. Tucker's handler list ends with `fellThrough`, which
records and fails an `/api` request nothing above it answered; every other frame falls
through to the server, and the fixture fails the test at teardown listing the recorded
ones, e.g. `GET /api/goal/progress`.

`page.route` beats `context.route`, so a spec's own route still wins — that is the
migration's coexistence, and how non-API routes (zxing CDN abort) keep working.

The package is pre-1.0 and calls its use of `page.route` an implementation detail. If it
moves to a service worker, the Workbox coexistence has to be settled again.

## Typing

`createOpenApiHttp<paths>` (`paths` from `#open-fetch-schemas/api`, type-only, so it is fine
at Playwright's runtime) checks the path, path params, query keys, request body, status and
response body. `response(status).json` exists only for a `*/json` media type, which is why
the backend sets `springdoc.default-produces-media-type: application/json` (in main **and**
the test `application.yml`, which shadows it). Without it every body is `*/*` and
`.json` is `unknown`.

`frontend/test/**` is typechecked by `pnpm typecheck` (the app tsconfig includes it);
`frontend/e2e/**` is not, so keep typed handlers in `test/mocks`. A type annotation in a
spec is documentation and checks nothing: data that has to be checked lives under `test/`,
or is stated as unchecked — an annotation in `e2e/` never answers a typing finding.

## Traps measured so far

- **ofetch GET retry.** A `{ once: true }` 500 override showed as 200: the automatic retry
  hit the baseline. Override without `once`, or the call passes `retry: 0` (ADR 0007).
- **Proving a client sends its local day** stays in the mocked e2e — Vitest runs in the
  host zone and CI in UTC. `pinToLocalMorning(page)` (`e2e/support/date.ts`) returns the
  local day to let the handler answer alone; the red is the same spec run with
  `test.use({ timezoneId: 'UTC' })`. Why it is not `setFixedTime`: frontend-dev's gotchas.
- **A read that fails, then recovers on Retry**, is a failure override with a predicate
  (`catalogFails(() => down)`) that returns `undefined` once it is false, falling through
  to the handler under it.
- **A Check-only page still reads the shell's endpoints**: `/api/profile` always, and Today's
  `/api/weight/latest` and `/api/goal/progress` on any spec that starts at `/`.
- **Holding a request open** is `held(method, path, matches?)` (`test/mocks/http.ts`): it
  returns `{ handler, arrived, release }`, holds what `matches` admits, and once released
  falls through to the handler under it, which answers normally — so
  `use(held(...).handler)` after `...weightMeasurements(null)` holds a save. Within one
  `use()` call the first argument wins. Three rules it carries for you, each measured:
  - `matches` reads a clone, because a handler that reads the body and falls through
    leaves the next one "Body has already been used".
  - Await `arrived` to act while the request is in flight, rather than counting calls.
  - A request released at the end of a test finishes in the next one, so wait for what
    it changes on screen after `release()` (the new row, the emptied list).
- **A `page.route` spec hid every read it did not route.** An unmatched `/api` request
  went on to the server's proxy and failed there unnoticed, so a spec moved over can meet
  reads its old mocks never mentioned — a page's own, or the shell's on the way to it.
  The unhandled failure names each one; add it to the baseline.
- **A matched handler that returns nothing is "handled".** With nothing under it to
  answer, msw passes the request through to the real network ("fetch failed" in
  Vitest, the server's `/api` proxy in Playwright) and never calls `onUnhandledFrame`,
  so a hold or a predicate override with no handler beneath it escaped the
  unhandled check entirely. Both layers end their handler list with `fellThrough`
  (`test/mocks/http.ts`), which records the request and fails it; `node.test.ts` and
  `e2e/network-fixture.spec.ts` pin it. It is the only uncovered-`/api` path now: no
  `/api` request reaches `onUnhandledFrame` any more.
- **A re-read answered with the state from when it arrived** — the stale read a
  superseded load must not land — is `getResponse(handlers, request)` (from `msw`)
  inside the holding handler, returned once released (`ManageTagsSheet.test.ts`).
- **"Sends nothing" is shown by what a send would have made visible**: the server's
  refusal in its own words, which differ from the field's (`a Tag name must not be
  blank`), or closing and reopening a sheet that reads afresh on open. "Asks for nothing
  while closed" has no visible form at all; it becomes what reading on open is for — a
  Tag created while the sheet was shut is offered once it opens.
- **The typed handler can only send what the spec declares.** `POST /api/tags`
  declares 200 alone, though the backend answers a new Tag with 201, so `foodCatalog`
  answers both with 200 (#420).
- **Coexistence in Vitest.** A path registered through `registerEndpoint` is answered by
  Nuxt even in an opted-in file, ahead of any MSW handler for it. The shim makes URLs
  absolute, which Nuxt's registry only knows relative, so it strips `location.origin` and
  hands a registered path to Nuxt's `fetch` itself. The last migration slice deletes it.

## Red-proof runs

- **Build once.** Write every break to its own copy (`e2e/redproof-bNN-<spec>`, with the
  `-snapshots` directory copied beside it, or the aria snapshot fails as missing rather
  than as different) and run them in one Playwright invocation. Vitest copies go under
  `test/`, with `./` imports made `~/`. Delete the copies afterwards.
- **An absence-only test passes with the page unrendered**, so no break turns it red until
  it also asserts something the page shows. Probity refuses adding that assertion to a
  green test as it stands: run a copy carrying the assertion under the break first, so
  the strengthened test is seen red, then edit the real file.
- **A guard on a query the page must send is shown red by renaming what it reads.** Copy
  the handler file with the guard reading a parameter the page never sends
  (`query.get('clientTodayX')`) and point the spec copy's import at it: that is the page
  dropping the parameter. "The built app's request cannot change" is never a reason to
  list a guard as unprovable. A guard on a body field the page stamps (an Entry's `date`)
  is shown red the same way, by comparing against a day the page never sends.
- **A test answered by the baseline needs the baseline swapped**, or no break in a copied
  handler file reaches it. In the spec copy, `test.use({ handlers: [copyBaseline, {
  option: true }] })` — wrapped, because Playwright reads a bare array as its
  `[value, options]` tuple and fails every test with `handlers.every is not a function`.
- **Cap the e2e copies' timeout.** A never-answering break waits out the suite's
  300 s test timeout once per test it reaches (three such breaks ran #403's first sweep
  for hours). The copies append `test.beforeEach(() => test.setTimeout(30_000))`.
- **A break that changes nothing the User can tell apart proves nothing.** An offline
  look-up that falls through lands on a miss, which the page answers identically by
  design; the break that discriminates answers a candidate instead.
- **Script it and read a kill matrix.** Generate every copy from one list of breaks, run
  them all, and tabulate which break turned each test red, per Playwright project. Include
  one **unbroken control copy**: it must pass, or the harness is what failed — the first
  #402 run failed all 384 copies on a copying fault and read as 384 kills. A test no
  break kills is a missing break, not an unprovable test. Drop the **first and the last**
  row, not "a row" — a test that queries one Food dies only when that row goes — fail the
  reads, and include a break that answers data the test never listed (an extra Food);
  without it, tests about what a list holds — no match, no chips — survive.
