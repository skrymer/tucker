# Phone overlays are Reka Dialog bottom sheets, not Vaul drawers

Tucker's responsive overlay (`ResponsiveOverlay.vue`) hosts every input sheet —
log-by-grams, log weighed/estimated entry, log weight, barcode scan. It rendered
a Nuxt UI **`UDrawer`** (a [vaul-vue](https://github.com/unovue/vaul-vue) bottom
drawer) on phone and a **`UModal`** (a Reka UI Dialog) on desktop.

On an **installed iOS PWA** the Vaul drawer freezes: focus the weight field (the
soft keyboard opens), then tap outside the field to dismiss the keyboard, and the
whole sheet goes dead — the field, Log, and Cancel stop responding. It is
intermittent (it depends on the keyboard-dismiss timing) and was confirmed on a
real iPhone. The pinned `vaul-vue@0.4.1` has **no** `visualViewport`/keyboard
handling at all, and the failure matches the wider Vaul-on-iOS class: in
standalone PWA mode Vaul's `position: fixed` content plus its `body` scroll-lock
(which sets `pointer-events: none` on `body`) lose pointer isolation after the
keyboard transition, so taps fall through to the inert body
([shadcn-ui/ui #8507](https://github.com/shadcn-ui/ui/issues/8507)). No
vaul/vaul-vue release notes claim a fix; the attested workaround is to **stop
using the Vaul drawer and use a Radix/Reka Dialog "sheet"** instead. It does not
reproduce in a desktop browser or in chromium device-emulation (no soft
keyboard), so it is verifiable only on the device.

## Decision

`ResponsiveOverlay` renders a **`UModal` (Reka Dialog) on both breakpoints**. On
phone it is styled as a bottom sheet via the `content` `:ui` slot — pinned to the
bottom edge, full-width, rounded top, sliding up from the bottom and clearing the
iOS home indicator (`env(safe-area-inset-bottom)`). Desktop keeps the default
centred modal. Both keep the modal semantics we want — backdrop dim and a focus
trap — but via Reka's Dialog mechanism, which does not have the Vaul iOS bug.

The Dialog's corner **close button is kept** (Nuxt UI default). It replaces the
drawer's swipe-to-dismiss, which the Dialog drops: `LogEntrySheet` and
`LogWeightSheet` have no Cancel button of their own, so the close button is their
universal out. Outside-tap/swipe no longer dismiss a sheet — acceptable, and
arguably better for a data-entry form (a stray tap can't discard a half-typed
entry; it is now a no-op rather than a freeze).

## Rejected alternatives

- **`:modal="false"` on the Vaul drawer.** Removes the `body` `pointer-events:
  none` lock (the freeze mechanism), but regresses the modal UX: no backdrop dim,
  the background list stays interactive (a background row's controls fire
  *through* the open sheet, stacking overlays), and outside-tap no longer
  dismisses. Verified in-browser. Rejected.
- **Upgrade `@nuxt/ui` / `vaul-vue`.** No changelog or maintainer comment confirms
  a fix for this specific iOS-PWA freeze; betting a dependency bump on an
  unverified fix is a guess, and a larger surface to re-verify. Rejected.
- **Keep Vaul + a synthetic `pointerup` workaround.** Bespoke, fragile, and aimed
  at a different (snap-point/dock) Vaul issue. Rejected.

## Consequences

- One overlay mechanism (Reka Dialog) for phone and desktop; the bottom-sheet
  styling lives in one place (`ResponsiveOverlay`), so call sites are unchanged.
- Sheets close via the corner close button or their own Cancel; do not rely on
  outside-tap or swipe to dismiss a `ResponsiveOverlay`.
- The phone sheet now has a corner close button (the Vaul drawer had none) — the
  `[[phone-drawer-has-no-close-x]]` assumption no longer holds.
- This freeze class is **iOS-PWA-only** and invisible to the test suites
  (chromium has no soft keyboard); the regression guard is this ADR plus the
  `ResponsiveOverlay` code comment, not an automated test.

## References

- [shadcn-ui/ui #8507 — Drawer (Vaul) breaks pointer isolation in iOS PWA standalone](https://github.com/shadcn-ui/ui/issues/8507)
- [emilkowalski/vaul #555 — pointercancel not handled on iOS](https://github.com/emilkowalski/vaul/issues/555)
- On-device verification on the installed iPhone PWA (2026-06-18).
