# API mocks are one MSW handler set, and tests assert what the User sees

The frontend mocked `/api` two ways with nothing shared: `registerEndpoint` in Vitest
and `page.route` in the mocked Playwright suite. Each layer hand-wrote the same response
shapes, untyped, and the two matched requests differently. A `page.route` glob ending at
a path silently stops matching once the request gains a query string, which is how
#358's `?clientToday=` slipped through. We decided both layers use **one set of
[MSW](https://mswjs.io/) 3 handlers**, typed against the OpenAPI spec with
[`openapi-msw`](https://github.com/christoph-fricke/openapi-msw), and that **no test
asserts on a request**. A handler validates what it is sent and keeps whatever state the
page reads back. The test asserts only what the User sees.

*Status: accepted. Covers the Vitest and mocked Playwright layers. The real-stack smokes
(`pnpm test:smoke`) hit the live backend and are untouched.*

## The decisions

- **One baseline of happy paths, overridden per test.** `test/mocks/handlers/<domain>.ts`
  describe a neutral, consistent account: an empty day, no Goal, Calorie Tracking on.
  Every test inherits it, and a test `use()`s only the variation it is about.
  `onUnhandledRequest: 'error'` makes a request outside the baseline fail the test. That
  ends both silent defaults, a 404 in Vitest and the real network in Playwright, one of
  which once let an unmocked `/api/goal/progress` decide what an aria snapshot captured.
- **Handlers are typed from `openapi/tucker.json`.** `createOpenApiHttp<paths>()` checks
  the path, its parameters, the query, the request body and the response body against the
  generated `paths` type (`#open-fetch-schemas/api`). A mock that drifts from the spec is
  a type error, not a test that passes against a backend that no longer exists.
- **Tests do not assert on requests.** A query the page must send, such as Check's
  `clientToday`, is answered by a handler only when it is right, and with a 400
  otherwise, so a wrong value surfaces as the error state the User would meet. A mutation's
  handler stores what it was sent, and the test asserts the page after the re-read. A test
  that captures a request body or URL and asserts on it pins *how* the page asks rather
  than *what it shows*. Being as close to what the User sees as possible is the rule
  Testing Library already sets for queries, here applied to the network.

## How each layer reaches MSW

- **Vitest: stock `setupServer` from `msw/node`, behind a shim in `test/setup.ts`.**
  Unaided, it cannot work under `environment: 'nuxt'`, for two independent reasons,
  both measured:
  1. `@nuxt/test-utils` wraps `fetch` so that an unregistered relative URL answers 404
     without ever reaching the network layer MSW intercepts.
  2. msw 3 mocks beneath `fetch`. Its interceptor builds `new Request(...)` from the
     global, which is happy-dom's, and hands it to the real `fetch`. Node's `fetch`
     cannot read a foreign `Request` ("Failed to parse URL from [object Request]").

  The shim unwraps a `Request` into a URL and an init before Nuxt's `fetch` sees it, and
  rebinds `$fetch` with `baseURL: location.origin` so relative `/api/*` calls resolve.
  `$fetch`, the generated `$api` client, query strings, bodies, `use(…, { once: true })`
  and `resetHandlers` all behave as documented through it.
- **Playwright: [`@msw/playwright`](https://github.com/mswjs/playwright)'s `network`
  fixture.** It provisions interception through Playwright's own routing, not a service
  worker. That leaves the app's Workbox service worker (ADR 0011) the only worker on its
  scope, and leaves `e2e/signed-out.spec.ts`'s real redirects for `/cdn-cgi/` and
  `/sign-in` alone.

## Considered options

- **Switch Vitest to `domEnvironment: 'jsdom'`.** There, Nuxt polyfills `Request` as a
  subclass of Node's, and stock `setupServer` intercepts absolute URLs. Rejected because
  relative `/api/*` still needs the same `$fetch` rebind, and moving off happy-dom failed
  54 existing tests across 5 files. It is the larger change for no less glue.
- **A `getResponse` bridge** that resolves requests through MSW's handler matching
  without its interceptor. It works, but it reimplements `setupServer`'s lifecycle
  (`use`, `resetHandlers`, `once`) in our own code. Rejected once the shim above made the
  stock server usable.
- **[nuxt-msw](https://github.com/shunnNet/nuxt-msw)**, whose test helper does the same
  `$fetch` rebind. Rejected: it supports msw 2 only and has not been published since
  2024-11. We take the idea and leave the dependency.
- **Vitest Browser Mode with `setupWorker`**, MSW's documented Vitest path. Rejected
  because it re-platforms the whole unit layer onto a real browser, and
  `renderSuspended` and the `nuxt` environment are built for the Node runner.
- **MSW's browser worker in the mocked e2e build.** Rejected for the two-service-worker
  problem above, and because overrides would have to cross into the page through
  `page.evaluate`.
- **Plain `msw` `http.*` handlers annotated by hand** from `components['schemas']`. Rejected
  because a handler for a path that does not exist, or a wrong status, would still compile.
- **Porting request assertions mechanically** to keep the migration assertion-neutral.
  Rejected under the rule above. Five specs (`check`, `micronutrient`, `profile`,
  `recipe-builder`, `recipe-edit`) convert from capturing a request to asserting the page.

## Consequences

- **ofetch retries a failed GET by itself.** An error override registered with
  `{ once: true }` is answered by a retry that reaches the baseline, so the error never
  shows. An error-state test overrides without `once`, or the call passes `retry: 0` as
  the barcode lookups already do (ADR 0007).
- **`@msw/playwright` is pre-1.0**, and its README calls its reliance on `page.route` an
  implementation detail likely to change. If it moves to a service worker, the coexistence
  with Workbox has to be settled again.
- **Migration is per surface, both layers at once**, each migrated file opting in to the
  baseline explicitly so that unmigrated files behave exactly as before. Playwright gives
  a later `page.route` precedence over the fixture, and the Vitest shim sends a path
  still registered through `registerEndpoint` to Nuxt's handler first. The last slice
  makes the baseline global, deletes both old mechanisms, and bans them with ESLint.
