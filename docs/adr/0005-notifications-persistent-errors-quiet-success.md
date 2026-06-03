# Notifications: persistent retryable errors, success only when invisible

Tucker is a phone-first installable PWA. It used Nuxt UI toasts — bottom-anchored,
~5s auto-dismiss — for **both** success confirmations and error messages, all
routed through the shared `useApiMutation` factory. On a phone that conflates two
messages with opposite requirements:

- A **failed** mutation (profile save, weight save, goal set, food add, food
  delete, entry log) is high-stakes and must be acknowledged. A 5s auto-dismiss
  means a user who glances away — or whose installed PWA loses focus, trivial on
  iOS — never learns their data was not saved. Network failure is also an
  *expected* state in a PWA, not an edge case.
- A **success** is low-stakes. When the result is already on screen (a card that
  updates, a row that appears or disappears, a trend that grows), a toast saying
  the same thing is redundant noise.

We split the two message types and treat them differently. The rules below are
the convention every current and future mutation follows; like
[0003](0003-validate-forms-with-zod.md) and
[0004](0004-compose-inline-composables.md), they are centralized so call sites
cannot drift.

## Errors — a persistent retryable snackbar

A failed mutation surfaces a **persistent toast** (no auto-dismiss) carrying a
**Retry** action that re-runs the same mutation with the same arguments, plus an
explicit close. It is dismissed only by a successful retry or by the user. This
is the Material 3 "snackbar with action" pattern. iOS has no system
snackbar-with-retry equivalent — which is itself a reason to own the behaviour in
one composable rather than improvise it per screen.

We considered an **inline/top banner rendered per surface**. Rejected: it means
adding banner state, markup, and a Retry wire-up to every page, form, and
overlay (including inside `LogEntrySheet`, which has no natural banner slot),
inviting drift across the six flows; and on a tall scroll view a top banner can
sit above the fold — the same "user misses it" failure we are fixing. A
bottom-anchored toast is in the phone's thumb zone and is identical everywhere
because it lives in one composable.

The active sheet/overlay stays **open** on error (it closes only in the success
path, which doesn't run on failure), so Retry replays against the still-populated
form and no input is lost. The mutation's arguments are captured in the error
path's closure, so "the same arguments" is literal — Retry re-invokes
`execute(...args)` with the failed call's payload. Re-entry is already guarded by
the `pending` flag, so a double-tap on Retry (or on the form) can't fire two
mutations. The toast carries a stable `id`, so repeated failures of the same
mutation pulse the existing toast rather than stacking.

## Success — only when the result isn't visible at the point of focus

Keep a success toast **only when the result isn't already visible where focus
lands** after the action. Default to silent. By that test:

- **Dropped:** Profile saved, Goal set (form → card updates in place), Food
  added (row appears in the list), Food deleted (row disappears — the
  disappearance is the confirmation), Weight saved (appears in the trend). The
  visible state change *is* the confirmation.
- **Kept:** Entry logged — the log sheet closes and returns to the Today
  dashboard, where the only confirmation is a calorie/protein delta that may be
  scrolled off-screen. Focus lands somewhere the result isn't reliably visible,
  so the toast bridges "sheet closed → it worked."

Validation errors (bad input) are **not** toasts and never were — they stay
inline next to the field via the Zod `UForm` setup ([0003](0003-validate-forms-with-zod.md)).
This decision covers only network/server failures and success confirmations.

## Consequences

- The error/success behaviour lives in `useApiMutation`. The error path emits a
  toast with `duration: Infinity` (the Reka value that disables the auto-dismiss
  timer), `close: true`, a stable `id`, and a Retry action bound to
  `() => execute(...args)`. The success path stays optional via `successTitle`.
- Adding a `successTitle` to a flow whose result is already visible is a
  regression — the default is silent. After this change only the entry-log
  mutations in `LogEntrySheet` pass one.
- **a11y:** errors use `type: 'foreground'` (aria-live **assertive** — a direct
  result of user action that must interrupt). Success **must explicitly** pass
  `type: 'background'` (aria-live **polite**), because Reka defaults `type` to
  `foreground`; this line governs only the one surviving success toast ("Entry
  logged"). A known limitation: re-`add`ing a stable-`id` error pulses in place
  rather than re-announcing, so a repeated identical failure may not re-fire the
  assertive announcement.
- **One toast at a time:** `toaster.max` is `1` on `<UApp>`, satisfying the
  issue's "cap concurrent toasts at 1 on phone" so the bottom slot never stacks
  into the phone nav or the `/foods` FAB. Nuxt UI's `max` keeps the **newest**
  toast (it removes the oldest on overflow) — it does *not* prioritise a
  persistent error over a later toast. In practice the only thing that can evict
  a live error is another user-initiated result (the lone "Entry logged" success,
  or a newer error that supersedes it), and the stable `id` already collapses
  repeats of the same error; we accept that narrow eviction rather than add
  priority queueing. The toast viewport's z-index (`z-[100]`) sits above the
  FAB (no explicit z-index), so the user dismisses an error before adding another
  food, which is acceptable for an error state.
- **Safe area:** the toast viewport offset includes `env(safe-area-inset-bottom)`
  (`bottom-[calc(5rem+env(safe-area-inset-bottom))] lg:bottom-[calc(1rem+env(safe-area-inset-bottom))]`)
  so a now-long-lived error toast clears the iPhone home indicator. This relies
  on `viewport-fit=cover`, already set in `nuxt.config.ts`.
- Online-event auto-retry (re-firing when connectivity returns) is **out of
  scope** here; manual Retry covers the come-back-online case. It is a candidate
  for the F6 PWA-polish work.

## References

- Material 3 snackbar: <https://m3.material.io/components/snackbar/guidelines>
- Nuxt UI Toast (`actions`, `duration`, `type`, `toaster.max`):
  <https://ui.nuxt.com/components/toast>
- Issue #27; informed by a mobile-UX review during the #16 toast-position
  walk-through.
