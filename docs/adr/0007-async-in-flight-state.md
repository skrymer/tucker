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

### Amended by [#180](https://github.com/skrymer/tucker/issues/180): an untouched field mirrors its seed

Throughout this section the **seed** means the values the sheet hands the form
(`AddFoodForm`'s `initial` prop) — deliberately not "the source", which this
codebase already spends on the **Nutrition Provider**
([0006](0006-provider-agnostic-nutrition-lookup.md), and the `filledFromSource`
prop right next to it). A Candidate's seed comes from a Provider; a miss's seed
is a bare barcode; both are seeds.

"Fills only the fields the user has not touched" is a rule about *filling*, and
it left the opposite case undecided: what an untouched field should show once the
seed stops supplying it. The merge answered "whatever it showed before" — not
by choice, but because a value the seed never had and one it has withdrawn are
the same `undefined`. That is how a failed look-up left the *previous* product's
name and macros sitting under the *new* barcode, with the Inconclusive note
inviting the user to "fill in the details above" while the details above
described something else. Taking that advice files product A under barcode B:
the catalog corruption [#164](https://github.com/skrymer/tucker/issues/164)
closed, reached from the other side, and *more* reachable than before because the
note is what invites it.

The fix is not a new rule but the same one stated completely. **An untouched
field mirrors its seed, including when the seed says nothing.** An untouched
field's value can only have come from a seed — the user's own values are, by
definition, touched — so a value the current seed does not supply belongs to a
*previous* seed and is stale by construction. There is no case where keeping it
is right: on a manual start the field is blank anyway, and a candidate lacking a
macro an earlier candidate supplied is withdrawing it too, just as correctly.

Note what this is **not**. It is not a remount: `state` is never rebuilt, so #58
stays dead and nothing the user typed is ever at risk. And it needs no signal
threaded from the caller — withdrawal gets no representation of its own, so the
merge still cannot tell "withdrawn" from "never supplied" and no longer needs to.
That matters more than it reads: mirroring is idempotent, and the seed object
`AddSheet` feeds in is a `computed` that yields a fresh identity on every
keystroke in the barcode field. A rule phrased as an event — *clear on
withdrawal* — would have to fire exactly once; a rule phrased as a mirror is
free to run on every one of them.

That boundary is only as trustworthy as the signal behind it, and the signal had
a hole worth naming. A number field commits its model on **blur**, so a macro the
user was *still typing into* looked pristine to the merge — and mirroring would
blank the digits under their cursor. A field is therefore marked touched on the
**keystroke**, not on the commit, which is what makes "a dirty field is never
overwritten" true of the macros rather than only of the name. The hole predates
this decision (a candidate resolving mid-entry already overwrote those digits);
what mirroring changed is that the same race stopped producing a wrong value and
started producing no value, which is worse and is the one outcome
[0005](0005-notifications-persistent-errors-quiet-success.md)'s sibling rule —
silent data loss — puts above all others.

The rule stops at the touched boundary, and that is deliberate rather than an
oversight. A field the user edited while a candidate was showing still carries
that product's text into the next barcode's save. Clearing it would mean deciding
their typing was about the old product — the judgement this section refuses to
make — so it stands, visible and editable, as the bounded residual of "the
human's value wins". The blast radius is one caller: `AddSheet` is the only
consumer that seeds `AddFoodForm` at all, and the recipe builder's inline
"add a new food" mounts the same form with no seed, so the merge never runs
there.

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

### Amended by [#164](https://github.com/skrymer/tucker/issues/164): the server always reaches a verdict first

The 8 s cap above stands unchanged. What was missing is its **relationship to the
server's own give-up point**, which nothing ever decided — so the two coincided by
accident, in the one combination that cannot work. The barcode lookup's server-side
budget was `3 × (5 s connect + 8 s read) + 2 × 250 ms ≈ 39.5 s` against a client
that left at 8 s. Attempts 2 and 3 could never reach a user; they completed into a
connection the browser had already closed, tripling load on a Provider that IP-bans
abusive callers.

The rule now: **a server-side budget must fit inside the client's timeout, with
margin.** The client's abort is a backstop for a dead connection *to Tucker* — never
the arbiter of what a look-up found.

The reason is not politeness about load. It is that **an abort tells the screen
only that it got nothing** — never *why* the answer is missing. A client that gives
up first has to manufacture a verdict from that silence, which is precisely the bug
[#164](https://github.com/skrymer/tucker/issues/164) fixes on the server, re-created
one layer up: the screen would once again be guessing between "no answer" and "the
answer is no". Letting the server always answer first is what makes an **Inconclusive
Lookup** ([0006](0006-provider-agnostic-nutrition-lookup.md)) reach the user at all.

`run()` originally returned a bare `undefined` for a timeout *and* a supersede
alike, which pushed even the small part it does know — was this run replaced, or
did it hang? — onto its callers, who each hand-rolled a parallel counter to
recover it. It now returns a discriminated `AsyncOutcome`
(`ok | superseded | timedOut`) instead. That stays inside this composable's remit:
supersession and abort *are* the cancellation lifecycle it already owns, and it
still holds no toast and no form knowledge. What a screen should *say* about a
`timedOut` remains policy, and remains with the caller.

Concretely, for the barcode look-up: the Provider gets **2 s** to connect and
**4 s** to read, and only *fast-failing* transport errors are retried. Retrying is
allowed inside a **1 s window**, after which the attempt in flight is the last one:

```
1 s retry window  +  2 s connect  +  4 s read  =  7 s
```

— inside the client's unchanged **8 s**.

That sum is **enforced, not merely documented.** The window is derived as
`TOTAL_BUDGET − connect − read`, so raising a timeout narrows the window rather
than overrunning the cap. This matters more than it first appears: the failures
worth retrying are name-resolution ones, and the JDK bounds `connect` and `read`
but *never the resolver* — `setConnectTimeout` applies to `Socket.connect`, long
after `getaddrinfo` has returned. Three attempts against a slow resolver could
therefore blow past 8 s with every individual leg still "within timeout", which is
precisely the silence the client would then have to invent a verdict from.

Two things this does **not** bound, stated so nobody reads more into the sum than
it carries. A *single* attempt against a pathological resolver: nothing short of a
different HTTP client can bound that, and what the budget prevents is multiplying
it by the retry count. And the chain: the budget is enforced **per Provider**, so
*n* barcode-capable Providers cost up to *n* × 7 s. v1 runs exactly one
([0006](0006-provider-agnostic-nutrition-lookup.md)), which is the only reason the
per-Provider budget and the per-lookup budget are the same number today. A second
Provider needs a chain-level deadline in `BarcodeLookupService`, not a second copy
of this arithmetic.

The acceptance criterion "the backend does not continue retrying a look-up the
client has abandoned" then holds by construction rather than by plumbing: there is
nothing left running to abandon.

One more attempt was hiding on the **client** side, found while building
[#171](https://github.com/skrymer/tucker/issues/171) and recorded here because
this section is where the arithmetic lives. **ofetch retries a GET once by
default**, and `503` is in its stock `retryStatusCodes` — so a look-up the
Provider refused was silently costing *two* round-trips before the screen said
anything, each one driving the whole provider chain and a real Open Food Facts
hop.

That quietly undid the rule three paragraphs up. The backend retries only
fast-failing transport errors and **deliberately excludes** slowness, rate limits
and server errors, because repeating those multiplies load on a Provider that
IP-bans abusive callers ([#164](https://github.com/skrymer/tucker/issues/164)) —
and a **Check** raises scan volume sharply
([0022](0022-a-check-states-cost-and-return-and-never-labels-a-food.md)). Having
the client re-add that multiplication one layer up is the opposite of the
decision. So **both barcode look-ups pass `retry: 0`** — the Check's and
Add-Food's. It halves the provider load and the time-to-alert on an
**Inconclusive** look-up's 503 — and, less obviously, on every failure with *no
response at all* (a dropped connection, offline, DNS), because ofetch codes a
thrown `fetch` as `500`, which is also in its retry set. A proxy 5xx was doubled
too, but by the status set rather than that fallback.
A miss (404) was never doubled, nor is the Check's own incomplete-nutrition 422
(the Add-Food look-up has no such outcome). On the
Check tab it also makes this amendment's own claim — the round-trip was the only
thing that broke, so it is the only thing redone — literally true. The transient
blip the silent retry was covering is exactly what that user now has a button
for, on the one failure where asking again can help.

**Originally scoped to the Check look-up alone**, reversed by
[#182](https://github.com/skrymer/tucker/issues/182). The grounds were that
Add-Food's always-on manual peer ([0006](0006-provider-agnostic-nutrition-lookup.md))
made a silent second attempt free recovery on a path the user is not blocked on.
What that got wrong is **"free"**:

- The second attempt is never free, and the two Inconclusive shapes fail it in
  opposite directions. A **fast** one — a connect/DNS failure that exhausts all
  three attempts inside the 1 s window, or a Provider 5xx returned immediately —
  answers well within the client's 8 s, so the retry has room and *completes*:
  a second full provider chain and a second real Open Food Facts hop, against
  the one error class the backend has already decided is not worth repeating.
  A **slow** one — a read timeout burning the whole 7 s budget — leaves the retry
  about a second before the client's cap aborts it, so the browser's leg is
  abandoned while the server-side chain it just kicked off runs on. That second
  case is exactly the failure #164 fixed on the server ("attempts 2 and 3 could
  never reach a user"), re-created one layer up by the client.
- Not blocked is not the same as not waiting. The retry buys a not-blocked user
  nothing they did not already have — the manual peer was on screen the whole
  time — while delaying the note that tells them to use it by a whole round trip.

So the two look-ups now differ only where they genuinely differ: the Check tab
adds a **user-driven** "Try again" because it has no manual peer. Neither
re-asks on its own. If the deferred throttle
([0022](0022-a-check-states-cost-and-return-and-never-labels-a-food.md)) is ever
built it inherits one rule instead of two.

It is also a trap for tests, worth stating because it cost a red-green cycle: a
fixture that fails the *first* call and succeeds after was silently answered by
the client's own retry, so the failure never reached the screen. Model an outage
as a state the test switches off ("the source came back"), never as an attempt
count — an attempt count measures the HTTP client, not Tucker. That trap is
disarmed on the two look-ups above and still live on every other `$api` GET,
which keeps ofetch's default. Counting requests is fine where the *count itself*
is the behaviour under test rather than a proxy for an outcome. Both look-ups'
smokes now do it: each pins its own first ask at exactly one, and the Check's
additionally compares counts before and after a tap to prove "Try again" re-asks.

The trade is explicit. A Provider degraded past ~7 s is called Inconclusive even
though waiting longer might have worked — which is honest ("Tucker could not find
out") and recoverable in one tap, where the old behaviour was a silent blank form
that permanently degraded the catalog. We rejected the mirror arrangement (raise the
client above a 9 s server budget): it buys a slow Provider a second chance at the
cost of rewriting the 8 s threshold above, and on the Check tab — where there is
nothing else to do while waiting — it is 10 s of spinner.

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
//    run(...args) → { status: 'ok', value } | { status: 'superseded' } | { status: 'timedOut' }
//    (the discriminated outcome is #164's amendment, above)
```

`pending` is the logical in-flight flag (instant; drives the guard). `busy` is the
delayed flag bound to `:loading`. The two re-entry policies are deliberate:
**mutations guard** (a double-tap on Save must not fire two writes), **look-ups
take the latest** (a new barcode supersedes the old).

**Exception: a control that outlives its answer binds `:loading` to `pending`.**
`busy` is deliberately *held on* past the moment the answer arrives (`minBusyMs`,
so a spinner cannot flicker), and that is right for a spinner — it is about to be
replaced by content either way. It is wrong for a button that is still on screen
afterwards, because Nuxt UI derives `:disabled` from `:loading`
(`disabled || isLoading`), so the linger leaves a **dead control for up to 400 ms
after the work finished** — and a tap in that window is the user asking again.
The Check tab's "Try again" ([#171](https://github.com/skrymer/tucker/issues/171))
is the first such control: it lives inside an alert that stays put, so it binds
`pending`. `disabled: pending` alongside `loading: busy` does not help — loading
already implies disabled. The accepted cost is that a look-up which fails inside
150 ms flashes a brief spinner on that button, the glitch the delay exists to
prevent; it is tolerable here precisely because the button does not move or get
replaced. **`busy` remains the binding wherever the spinner replaces content** —
including the same screen's "Looking it up…", and the Add-Food "Look up" button.

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

  **Amended by [#164](https://github.com/skrymer/tucker/issues/164):** "never a
  toast" stands; **"silently" does not**, and it is what made this sentence load-
  bearing for a real bug. It lumps together a *miss* — where silence is right,
  because a blank form after a miss says something true — and an **Inconclusive
  Lookup** ([0006](0006-provider-agnostic-nutrition-lookup.md)), where the same
  blank form asserts something false: that the product is unknown. So an
  Inconclusive Lookup gets a quiet **inline note** in the sheet, in the same idiom
  as the "Filled from Open Food Facts" note above and for the same
  [0005](0005-notifications-persistent-errors-quiet-success.md) reason — the
  surface is already on screen and in focus, so it does not need a toast to reach
  the user. A miss stays silent, exactly as written.

  It gets **no Retry action**, and this is deliberate rather than an omission.
  0005's Retry exists because a failed mutation's alternative is *losing data*;
  a failed look-up's alternative is typing, which is an always-on peer here
  ([0006](0006-provider-agnostic-nutrition-lookup.md)) and already on screen. The
  "Look up" button is inches away, so a second control bound to the same call
  would be pure duplication. The **Check** tab is the opposite case — no manual
  peer, nothing else to do — and *earns* a retry affordance
  ([0022](0022-a-check-states-cost-and-return-and-never-labels-a-food.md)).

  **Delivered by F11 slice 3
  ([#171](https://github.com/skrymer/tucker/issues/171)):** a **"Try again"** that
  re-runs `GET /api/check/{barcode}` against the barcode *already decoded*. The
  camera is not restarted and the decode — which never failed — is not repeated;
  the network round-trip was the only thing that broke, so it is the only thing
  redone. Re-aiming a phone at a package is a cost the user should not pay for a
  failure that happened after the scan succeeded.

  It lives in the Inconclusive alert's own `actions`, which is what keeps the
  asymmetry honest: the control cannot render for a miss (404) or for incomplete
  nutrition (422), because it is inside the one alert those failures never show.
  Both of those are permanent for that product, and "try again" is actively bad
  advice while standing in a shop. Those two keep only **"Scan another"** — which
  restarts the camera, and stays available under all three, so a user can always
  abandon a product instead of retrying it. Neither surface uses a toast either
  way, so 0005's mutation-only scope is untouched.
- `useAsyncAction` is a shared, extracted composable, so it gets its own
  red-green unit tests ([0004](0004-compose-inline-composables.md)).
- **F6 offline:** when mutations gain an offline queue, a network failure becomes
  "queued" rather than "failed" inside `useApiMutation`; out of scope here.

## References

- Issue [#164](https://github.com/skrymer/tucker/issues/164) — the budget
  relationship and the Inconclusive Lookup's inline note (both amendments above).
- Issue [#180](https://github.com/skrymer/tucker/issues/180) — an untouched field
  mirrors its seed, including its silence (amendment above).
- Issue #58 (the data-loss bug); ADR [0006](0006-provider-agnostic-nutrition-lookup.md)
  (always-on manual peer, provider-as-cross-check), [0005](0005-notifications-persistent-errors-quiet-success.md)
  (feedback tone), [0004](0004-compose-inline-composables.md) (shared composables).
- `AbortController` / `AbortSignal.timeout` / `AbortSignal.any`:
  <https://developer.mozilla.org/en-US/docs/Web/API/AbortController>
