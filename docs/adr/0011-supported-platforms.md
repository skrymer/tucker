# Supported platforms: iPhone, Android, desktop Chrome & Firefox

[ADR 0009](0009-responsive-pwa-over-native-app.md) committed Tucker to a single
responsive PWA. F6 turns that PWA into something installable and push-capable — and
the web platform's install, push, and offline capabilities **differ enough between
browsers** that "it's a PWA" is too vague to build and test against. This ADR pins
the exact platforms Tucker supports and what each one can do, so the install and
reminder code (which must branch on these differences) has a recorded target.

## Decision

Tucker supports the following platforms. Capabilities differ; the code branches on
them rather than pretending they're uniform.

| Platform | Install as an app | Web push | Offline shell |
|---|---|---|---|
| **iPhone — iOS Safari** | Home screen, **manual** (Share → Add to Home Screen); no `beforeinstallprompt` | **Yes, but only once installed** to the home screen (iOS 16.4+) | Yes |
| **Android — Chrome/Chromium** (Edge, Samsung Internet, Brave) | **WebAPK**, programmatic via `beforeinstallprompt` — a real system app | Yes — in-tab **or** installed | Yes |
| **Desktop Chrome / Edge** | Yes, programmatic | Yes | Yes |
| **Desktop Firefox** | **No** (install removed) | Yes | Yes |
| **Android Firefox** | Basic home-screen shortcut only (no WebAPK) | Yes | Yes |

Two differences drive real code:

- **Install is programmatic on Chromium, manual on iOS.** The install affordance
  has two paths: capture `beforeinstallprompt` and drive a custom Install button on
  Android/desktop Chromium; show *instructions* ("Share → Add to Home Screen") on
  iOS; hide entirely when already running in `display-mode: standalone`.
- **iOS gates push on install; nobody else does.** On iOS the reminder toggle can
  only subscribe once the app is on the home screen — so on iOS the toggle shows an
  "add to home screen first" hint until installed. On Android and desktop the toggle
  subscribes straight from the tab. This is *the* reason install must land
  with-or-before the reminder.

"Installable as a real app" therefore means **Android Chrome (WebAPK)**, **iOS
Safari (home screen)**, and **desktop Chrome/Edge**. **Firefox is supported for use
and for push, but is not installable** — we do not chase a Firefox install story.

### How the shell is replaced

The precached shell is only ever as current as the service worker that precached
it, so an installed Tucker takes a new build only by refetching `/sw.js`. Four
URLs sit on that path — the shell `/`, the worker, the `/push-sw.js` it
`importScripts`, and the manifest — and Nitro served all four with **no**
`Cache-Control` at all. That licenses two different caches to answer them:

- **The browser's own**, by heuristic freshness
  ([RFC 9111 §4.2.2](https://www.rfc-editor.org/rfc/rfc9111#section-4.2.2)) —
  roughly a tenth of the age since `Last-Modified`, so hours for a build that has
  been up a day. This reaches `/push-sw.js` and the manifest, not `/sw.js`:
  `updateViaCache` defaults to `imports`, which is precisely the setting that
  bypasses the HTTP cache for the top-level worker and consults it for what the
  worker imports.
- **Any shared cache in front of the origin**, which for Tucker means Cloudflare
  ([ADR 0015](0015-production-deployment-topology.md)). `.js` is on its default
  cacheable-extension list, and an origin that states no policy is what lets the
  edge apply its own. Nothing in the browser can route around this one — a
  cache-bypassing update fetch still asks the edge, and gets whatever it holds.

Either way the app stays pinned to the build it happened to fetch — correctly, at
every layer, since the shell it precached names hashed assets that really are
immutable — and only deleting it from the home screen dislodges it.
`registerType: 'autoUpdate'` is no defence: it takes an update the moment it sees
one, and it is never told there is one.

So those four are served `Cache-Control: no-cache`, from one list
(`app/utils/pwaEntryPoints.ts`) that `nuxt.config.ts` builds its `routeRules`
from and `e2e/pwa-cache.spec.ts` asserts against a real build, so a fifth entry
point cannot be added to one and missed by the other. `no-cache` is
revalidate-always, not refetch-always: the conditional request answers `304`
without a body, which is what lets an offline-capable app still start fast.

The rule stops there, and "unhashed" is not the property — `favicon.ico`,
`robots.txt` and the icons are unhashed too, and are left alone because Workbox
precaches them with a revision and refetches them at a cache-busting URL, so a
stale one is cosmetic rather than a build that never arrives. Everything else the
build emits carries a content hash, so a new build gives it a new URL and
`public, max-age=31536000, immutable` is already right; a wildcard broad enough
to cover the four would sweep in every one of these to fix nothing.

## Out of scope / deferred

- **Native iOS/Android apps** — ruled out by [ADR 0009](0009-responsive-pwa-over-native-app.md).
- **Offline *writes* (Background Sync queue)** — deferred to its own future
  increment. iOS WebKit has no Background Sync, so an offline write queue would
  silently not work on the primary surface; it also collides with backend-computed
  determinism ([ADR 0002](0002-business-logic-belongs-in-the-backend.md)) and the
  irreversible Weekly Review. F6 ships only the **precached app shell** (so the app
  loads offline and meets install criteria); rare offline failures fall into the
  existing retry toast ([ADR 0005](0005-notifications-persistent-errors-quiet-success.md)).

## Consequences

- The install component branches on `beforeinstallprompt` availability and
  `display-mode: standalone`; the reminder toggle branches on iOS-installed state.
- The verify/walk-through and Playwright matrix already cover **Desktop Chrome** and
  **Mobile Chrome (Pixel 7)**, which exercise the programmatic-install and
  push-in-tab paths; the iOS instructional path is covered by rendering the hint when
  the programmatic prompt is unavailable.
- The origin header is necessary but not sufficient, and the two layers need
  verifying separately. `deploy/verify-prod.sh` reads the header *inside* the
  frontend container, which proves the deployed image carries the rule and is
  structurally blind to the edge; only a logged-in request to the real origin
  can show whether Cloudflare is still answering `/sw.js` from cache
  (`cf-cache-status`). `deploy/README.md`'s post-deploy checklist carries that
  half. The exposure is the two `.js` paths — `/` has no extension and
  `.webmanifest` is not on that list — so the remedy is an edge **Cache** Rule
  bypassing `/sw.js` and `/push-sw.js`, the second on its own account: a new
  worker `importScripts` it, so an edge-stale copy installs the old build's push
  handlers under a current worker. That is not the Access bypass
  [ADR 0015](0015-production-deployment-topology.md) rejected for these paths:
  that one would have opened an unauthenticated hole, this one changes what a
  gated response may be reused from and leaves every path behind the one Access
  app.
- One VAPID keypair reaches all of these — Apple adopted the standard Web Push
  protocol, so there is no per-platform server code.

## References

- [`CLAUDE.md`](../../CLAUDE.md) — F6 scope; the two-project (Desktop + Mobile
  Chrome) Playwright setup.
- [0009 — responsive PWA over native app](0009-responsive-pwa-over-native-app.md).
- [0006 — provider-agnostic nutrition lookup](0006-provider-agnostic-nutrition-lookup.md)
  — the "iOS is all WebKit" single-code-path reasoning that recurs here.
