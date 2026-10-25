# Performance is measured by Tucker itself, and no metric names a User

Moving between pages felt slow on an iPhone, in Safari and in Chrome alike, on the
same wifi as a desktop that felt fast, and nothing Tucker recorded could say why.
Tucker now measures its own performance in the browsers its Users actually use, and
sends the measurements to its own backend. **A metric is Tucker's, not a User's**: it
is stored without a `user_id`, so it belongs with `app_config` as the exception
[ADR 0021](0021-every-row-is-owned-by-one-user.md) already names, and nothing recorded
for it says which User it came from.

## Decision

- **What is measured is what every engine can measure.** A metric that WebKit, Blink
  or Gecko cannot report is left out rather than reported for some browsers only,
  because the browser that prompted this is the one a Chromium-only API misses. That
  admits LCP and INP (in every engine since Safari 26.2 and Firefox 144) and rules out
  CLS, Long Animation Frames, the Network Information API and Chrome's Soft Navigations
  API.
- **A route change is timed by Tucker's router**, from the navigation starting to the
  first paint after the new page mounts. It is its own measure, never relabelled as
  INP: it covers the page becoming ready, which can run past the interaction's next
  paint. A move the page is hidden for at any point is dropped rather than timed: a
  hidden page paints nothing until it is shown again, so its time would be the
  User's absence, not the page's speed.
- **Each route change is split three ways for that navigation.** `apiMs` is the wall
  time spent waiting on `/api` (Resource Timing). `serverMs` is the part of that wait
  the server spent working, which every `/api` response states in a `Server-Timing`
  header. Network and proxy is `apiMs − serverMs`, and render and JS is the rest. The
  split is measured per navigation, not assembled from per-endpoint server
  percentiles, which would need a hand-kept map of which endpoints each page calls and
  would add percentiles that do not add.
- **An event names a route, never a URL**: the router's route template (`/review`),
  so no id or query string is ever stored. Beside it go the layout (`phone` or
  `desktop`, the app's own breakpoint), whether the app is installed, the app version,
  for a route change whether this is the route's first visit since the page loaded, and an engine and OS derived
  on the server from the user agent. The raw user agent, the IP address and the exact
  screen size are never stored.
- **The app version is a semantic version**, and an event carrying anything else is
  refused: releases are ordered by semver precedence (a prerelease before its
  release, `+build` ignored), and an order needs every version to have a place in it.
  A build with no version stamped, frontend or backend, reports `0.0.0-dev`, which
  sorts before every release. The Admin's version filter lists releases in the same
  order, newest first.
- **Read as percentiles, never averages**, and a group with fewer than five samples
  shows no figure.
- **Kept 90 days**, pruned nightly, in the same SQLite database as everything else.
- **Sent batched**, flushed when the page is hidden, with `fetch(…, { keepalive: true
  })`, never `navigator.sendBeacon`: a beacon cannot carry the CSRF header every
  mutation must
  ([ADR 0025](0025-a-mutation-must-prove-it-came-from-tuckers-own-page.md)), and the
  endpoint is never exempted from it. A batch holds at most 50 events, a malformed one
  is refused whole, and each User may send 600 an hour, counted in memory so that
  capping them stores no identity either.
- **Lossy and silent.** A failed send is dropped, never retried or queued offline, and
  never shown. This is a stated exception to
  [ADR 0005](0005-notifications-persistent-errors-quiet-success.md): a persistent
  error toast with Retry is for something the User did, and the User did not send a
  metric.

## Considered options

- **A hosted monitoring service (Sentry or similar).** Route-change spans and
  dashboards come free, but every User's usage would leave Tucker for a third party,
  for an app that keeps every other row on one box. Self-hosting Sentry would not fit
  on that box.
- **Cloudflare Web Analytics.** One switch, but it measures full page loads, and the
  slowness is in navigation inside a single-page app.
- **OpenTelemetry's browser SDK and a collector.** The industry-standard pipeline, but
  a collector is another service on a 1-vCPU host, and it still needs custom code to
  time route changes.
- **Owning each metric by its User.** It would let one person's numbers be read on
  their own, and it would make the Admin's aggregate a cross-User query to justify,
  with a stored link to every User that nothing reads and that would have to go when
  they leave. The browser engine and layout already find the slow devices.

## Consequences

- A metric that a later browser API makes cross-browser can be added. One that only
  some engines report cannot, however useful it would be in Chrome.
- Who may read the metrics, and through what, is
  [ADR 0039](0039-an-admin-sees-how-tucker-performs-and-nothing-of-any-user.md).
