# In-flight async state: busy is local, results merge, the user always wins

Tucker has several async surfaces — a barcode look-up (typed or camera-decoded),
the camera-decode → look-up path, form mutations via `useApiMutation`
([0005](0005-notifications-persistent-errors-quiet-success.md)), and route data
fetches — and each handled "busy" ad hoc. That gap produced a real data-loss bug
(issue #58): in the Add-Food sheet the manual `AddFoodForm` is an **always-on
peer** to the barcode look-up ([0006](0006-provider-agnostic-nutrition-lookup.md)),
so the form *invites* typing at any time; but a look-up is async, and when a
provider **Food Candidate** resolved, the form was **remounted** (re-keyed
`candidate:${barcode}`) and **re-seeded from the candidate — silently discarding
whatever the user had just typed**. On a phone at the shop on a flaky connection
the look-up is slowest exactly when it is most likely to collide with typing.

This ADR sets the convention every async surface follows. Like
[0003](0003-validate-forms-with-zod.md)/[0004](0004-compose-inline-composables.md)/[0005](0005-notifications-persistent-errors-quiet-success.md),
the load-bearing parts are centralized so call sites cannot drift.

## Classify by what the user can do while it is in flight

The mistake behind #58 was treating "show a spinner on the button" as the whole
job. The real axis is not *is it slow* but *what surface is mutating and can the
user race it*. Tucker has four async shapes; each maps to one affordance.

| Surface | Example | Can the user race it? | Affordance |
|---|---|---|---|
| **Button action** (result lands elsewhere) | Look up, Save food, Log entry | only by re-tapping the same control | inline spinner on the triggering control + a re-entry guard; nothing else locks |
| **Result that re-seeds an editable surface** | Candidate → `AddFoodForm` | **yes — the dangerous one** | non-destructive merge; never a silent remount (below) |
| **Route data fetch** (no user input at risk) | `/today` summary, `/foods` list | no | skeleton on cold load; keep-stale-and-dim on refetch |
| **Optimistic** | — | — | **don't.** The backend owns the math ([0001](0001-domain-driven-design.md)/[0002](0002-business-logic-belongs-in-the-backend.md)); rendering a guess at numbers it owns, then rolling back on failure, fights [0005](0005-notifications-persistent-errors-quiet-success.md). |

Busy state is **local to the control that triggered it** (a button spinner) or to
**empty content** (a skeleton). No blocking overlay — claustrophobic in a phone
bottom-drawer and it steals the affordance from where the user's finger is.

## The user always wins: merge, don't remount

When an async result will pre-fill a form the user may have edited, it **fills
only the fields the user has not touched. A dirty field is never overwritten.**
No lock, no prompt.

- **Lock the form while pending** — rejected. The look-up is slowest exactly when
  the user is most likely typing; freezing the keyboard punishes them for the
  network, and it contradicts manual entry being an always-on peer ([0006](0006-provider-agnostic-nutrition-lookup.md)).
- **Prompt before replacing** — rejected as the default. A modal on top of a
  bottom-drawer is a heavy interruption for what is usually a non-conflict (the
  user normally looks up *instead of* typing, not *while* typing).
- **Silent clobber (the bug)** — rejected. Silent data loss is the one outcome a
  logging app must never produce.

The merge resolves the conflict structurally instead of asking. In the common
case (look-up *before* typing) every field is pristine, so the candidate fills
everything — identical to before. In the #58 race the user's typed name survives
and the blank macros fill. The only true conflict — a typed macro *and* a
different candidate macro — resolves to **the human's value wins**, consistent
with [0006](0006-provider-agnostic-nutrition-lookup.md) already treating provider
energy as a cross-check, not authoritative; the field stays visible and editable.

Concretely: drop `:key="formKey"` (the remount *is* the bug — it rebuilds the
form's `state` from `initial`), and merge the candidate field-by-field into
untouched fields. Because we now *don't* overwrite edited fields, surface a quiet
**inline** note when a candidate seeded the form ("Filled from Open Food Facts —
edit anything that's off"), not a toast — the fill is already visible, so per
[0005](0005-notifications-persistent-errors-quiet-success.md) it gets an inline
note, and the note also explains why an edited field didn't change.

## Stale results: supersede, don't reconcile

A superseded async result must never win over newer state. The primitive cancels
in-flight work with an `AbortController` rather than reconciling on resolve:
starting a **new** look-up aborts the prior one (`mode: 'latest'`), and dismissing
the sheet cancels whatever is in flight. Cancellation frees the connection on a
constrained cellular link *and* structurally prevents a stale result landing. An
`AbortError` is not an application failure and is swallowed.

Note we deliberately **do not** abort the look-up when the user merely edits a
field. Aborting on the first keystroke would throw away the candidate's *other*
fields — the macros the user didn't touch — when those are exactly what the
look-up is for. The dirty-field merge above already protects the edited field, so
a still-in-flight look-up is allowed to finish and fill the blanks; only a newer
look-up (a different barcode) supersedes it.

## Loading thresholds: delay in, hold once shown

A spinner waits **150 ms** before showing (a cached/LAN hit completes under this;
a flashed 80 ms spinner reads as a glitch — the re-entry guard still engages
immediately so a double-tap is blocked without *rendering* the spinner) and, once
shown, stays **≥ 400 ms** (so a borderline-fast call doesn't strobe). A hung
request aborts at **8 s** — at the shop, if nothing has landed in 8 s the
connection has effectively failed and the user should be unblocked to type
manually. Skeletons get the same 150 ms delay; the persistent-error toast
([0005](0005-notifications-persistent-errors-quiet-success.md)) has no threshold —
it appears when the call actually fails.

## The shared primitive: `useAsyncAction`

The pending lifecycle + anti-flicker timing + cancellation live in one composable,
the way [0004](0004-compose-inline-composables.md)/[0005](0005-notifications-persistent-errors-quiet-success.md)
centralize mutation boilerplate. It owns **timing and cancellation only** — no
toast, no form knowledge; policy composes on top.

```ts
useAsyncAction(action /* (signal, ...args) => Promise */, {
  mode,       // 'guard' (ignore re-entry — mutations) | 'latest' (abort prior — look-ups)
  delayMs,    // 150 — busy stays false under this
  minBusyMs,  // 400 — once busy shows, hold it this long
  timeoutMs,  // 8000 — abort a hung request
}) // → { pending, busy, run, cancel }
```

`pending` is the logical in-flight flag (instant; drives the guard). `busy` is the
delayed flag bound to `:loading`. The two re-entry policies are deliberate:
**mutations guard** (a double-tap on Save must not fire two writes), **look-ups
take the latest** (a new barcode supersedes the old).

## Consequences

- `useApiMutation` ([0005](0005-notifications-persistent-errors-quiet-success.md))
  is refactored onto `useAsyncAction` (`mode: 'guard'`), keeping its public
  `{ pending, execute }` and its persistent-error/quiet-success toast logic
  unchanged. Mutation forms keep binding `:loading` to `pending`; adopting the
  delayed `busy` for anti-flicker is a later, opt-in change.
- The barcode look-up uses `mode: 'latest'` with an 8 s `timeoutMs`; dismissing
  the sheet calls `cancel()`. Editing a field does not cancel (above).
- **A look-up failure is not a mutation failure.** A look-up is a speculative
  convenience; a miss/offline/timeout degrades **silently to manual entry with
  the barcode pre-filled** ([0006](0006-provider-agnostic-nutrition-lookup.md))
  and **never** raises the persistent retry toast — that pattern stays reserved
  for committed mutations where data loss is the failure consequence.
- `useAsyncAction` is a shared, extracted composable, so it gets its own
  red-green unit tests ([0004](0004-compose-inline-composables.md)).
- **F6 offline:** when mutations gain an offline queue, a network failure becomes
  "queued" rather than "failed" inside `useApiMutation`; out of scope here.

## References

- Issue #58 (the data-loss bug); ADR [0006](0006-provider-agnostic-nutrition-lookup.md)
  (always-on manual peer, provider-as-cross-check), [0005](0005-notifications-persistent-errors-quiet-success.md)
  (feedback tone), [0004](0004-compose-inline-composables.md) (shared composables).
- `AbortController` / `AbortSignal.timeout` / `AbortSignal.any`:
  <https://developer.mozilla.org/en-US/docs/Web/API/AbortController>
