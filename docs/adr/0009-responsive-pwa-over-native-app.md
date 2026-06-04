# Tucker is a responsive PWA, not a native iOS/Android app

Tucker is delivered as **one responsive Progressive Web App** (Nuxt + Nuxt UI,
`@vite-pwa/nuxt`) that adapts by breakpoint — a single-column, touch-first phone
layout and a wider desktop layout from one codebase — installable on the iOS home
screen and on desktop Chrome/Edge. We deliberately did **not** build a native
iOS/Android app, nor a cross-platform native shell (React Native, Flutter).

This ADR records that choice, because the iOS-home-screen focus makes "why isn't
this native?" a question a future contributor will reasonably ask.

## Why a PWA

- **One codebase, one deploy, instant updates.** Tucker is a personal,
  single-user tracker maintained by one person. A web app behind the existing
  Cloudflare Tunnel ships a fix the moment it's pushed — no second (or third)
  platform codebase, no build matrix, no app-store review gate between a fix and
  the phone in your hand. For a deterministic CRUD-and-math tracker, the native
  capabilities we'd gain (deep OS integration, peak animation polish) are not the
  product's value; the value is correct calorie/budget math and frictionless
  logging, which the web delivers.
- **Reach without store friction.** Install-to-home-screen on iOS and desktop
  covers the actual usage surfaces (groceries scanned on the phone, review on the
  desktop) without an Apple/Google developer account, store listing, or release
  cadence.
- **The web platform already covers our hard requirements.** The one genuinely
  device-flavoured feature — barcode scanning — runs client-side via `zxing-wasm`
  over `getUserMedia`, which works on iOS WebKit; web push covers the weekly-review
  reminder. Nothing F1–F8 needs forces a native runtime.

## Why not React Native / Flutter

A cross-platform native shell would buy native-feeling navigation and animation
and tighter OS hooks — at the cost of a separate toolchain, native build/release
pipelines, store submission, and a second skill set, all for a single-user app
whose bottleneck is correctness, not native UX. The trade lands clearly on the
side of the web for this product. (Concretely: the `mobile-developer` agent,
scoped to RN/Flutter, is *not* the right tool for Tucker's frontend work — UI
work goes through the `ui-designer` agent against the responsive Nuxt codebase.)

## Consequences

- **"Mobile" means the responsive phone layout, not a native target.** The app
  adapts by breakpoint within one codebase: bottom tab bar vs. side nav, drawer
  vs. modal, FAB vs. header button. There is no separate mobile app to keep in
  sync.
- **Mobile-first is a build and review discipline, not a separate workstream.**
  Screens are designed mobile-first (via the `ui-designer` agent) and every PR is
  walked through at **both phone and desktop viewports** under the `/verify` gate;
  the Playwright suites run on Desktop Chrome **and** Mobile Chrome (Pixel 7) to
  flush responsive bugs. This is how mobile quality is assured without a native
  codebase.
- **`zxing-wasm` on a single decode path** (ADR 0006) is a *consequence* of this
  decision: because iOS is all WebKit and the iPhone home-screen PWA is the
  primary scan surface, there is no native `BarcodeDetector` fast-path to fall
  back on — the web decode path must work everywhere.
- **Accepted limits.** No deep OS integration (HealthKit/Google Fit sync, native
  widgets, background tasks beyond what the web platform offers) and PWA install
  is slightly less discoverable than a store listing. If a future requirement
  genuinely needs native capabilities, this decision is revisited — and the PWA
  stays the baseline either way.

## References

- [`CLAUDE.md`](../../CLAUDE.md) — Architecture (responsive PWA, adaptive
  navigation) and the F1 app shell.
- [0006 — provider-agnostic nutrition lookup](0006-provider-agnostic-nutrition-lookup.md)
  — the `zxing-wasm` single decode path and its "iOS is all WebKit" rationale.
</content>
