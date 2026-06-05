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
- One VAPID keypair reaches all of these — Apple adopted the standard Web Push
  protocol, so there is no per-platform server code.

## References

- [`CLAUDE.md`](../../CLAUDE.md) — F6 scope; the two-project (Desktop + Mobile
  Chrome) Playwright setup.
- [0009 — responsive PWA over native app](0009-responsive-pwa-over-native-app.md).
- [0006 — provider-agnostic nutrition lookup](0006-provider-agnostic-nutrition-lookup.md)
  — the "iOS is all WebKit" single-code-path reasoning that recurs here.
</content>
