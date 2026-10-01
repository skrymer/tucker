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
lets JS/CSS/HTML fall through. Tucker's `onUnhandledFrame` lets non-`/api` frames fall
through to the server and records an unhandled `/api` one; the fixture fails the test at
teardown listing them, e.g. `GET /api/goal/progress`.

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
`frontend/e2e/**` is not, so keep typed handlers in `test/mocks`.

## Traps measured so far

- **ofetch GET retry.** A `{ once: true }` 500 override showed as 200: the automatic retry
  hit the baseline. Override without `once`, or the call passes `retry: 0` (ADR 0007).
- **Proving a client sends its local day** stays in the mocked e2e — Vitest runs in the
  host zone and CI in UTC. Pin `page.clock.setFixedTime` where the two days differ and let
  the handler answer only the local day; the red is the same spec run with
  `test.use({ timezoneId: 'UTC' })`.
- **A Check-only page still reads the shell's endpoints**: `/api/profile` always, and Today's
  `/api/weight/latest` and `/api/goal/progress` on any spec that starts at `/`.
- **Holding a request open.** A handler that `await`s a promise and returns nothing falls
  through to the next one, so `use(hold, ...weightMeasurements(null))` holds a save until the test
  releases it and then answers it normally. Within one `use()` call the first argument
  wins.
- **A `page.route` spec hid every read it did not route.** An unmatched `/api` request
  went on to the server's proxy and failed there unnoticed, so a spec moved over can meet
  reads its old mocks never mentioned — a page's own, or the shell's on the way to it.
  The unhandled failure names each one; add it to the baseline.
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
