# Goal start weight is the Trend Weight

A Goal's **start weight** is the **live Trend Weight at the moment it is set**,
derived by the backend — not the raw scale reading the user entered that day, and
not the trend as of the date the Goal is stamped with.

*Status: accepted; extends [0008](0008-maintenance-mode-is-the-absence-of-a-goal.md).*

## Context

**Goal Progress** is defined entirely on the smoothed **Trend Weight** — the
hero's "Now" is `currentTrendKg`, the EWMA (α = 0.10) over every **Weight
Measurement**, and ADR 0008 already put *reaching* and the *observed pace* on the
trend too. But the *start* weight was the **raw latest reading**, captured
client-side (`GoalForm` sent `latestWeight.weightKg`, the backend stored it
verbatim).

Progress therefore compared a smoothed value to a raw anchor, on two different
bases. Because the trend deliberately lags a single reading, a Goal set right
after a weigh-in couldn't read a clean 0%: a user who logged 107.0 then 107.5 and
immediately set a Goal saw start 107.5 (raw) against a trend of 107.05 —
"~2% already done," which reads like a bug ([#114](https://github.com/skrymer/tucker/issues/114)).

## Decision

The journey Goal Progress measures is a *trend* journey, so its start must be a
*trend* point. The backend sets `startWeightKg` from the **live Trend Weight** —
the EWMA over every measurement, as it stands at the moment the Goal is set;
`CreateGoalRequest` no longer carries it. A fresh Goal then reads exactly 0%
(start == now), and the whole computation is trend-to-trend.

This mirrors F3 dropping the user-entered `caloriesPer100g` once calories became
a derived value (`4P+4C+9F`), and it honours
[0002](0002-business-logic-belongs-in-the-backend.md): the client *can't* compute
the trend (it would have to re-implement the domain EWMA), so the value it can't
own moves to the backend. The raw reading is not lost — it lives on in the
**Weight-Measurement** history; it simply stops being the Goal's anchor.

**`startedOn` is the plan's origin date, not the key the anchor is looked up by.**
Every Goal the product creates begins now: `GoalForm` posts `localToday()` and
nothing else posts at all. That is a fact about the one caller, not a property of
the domain — `Goal.started` bounds `startedOn` from *above* only (ADR 0014: a Goal
cannot start in the User's future), and the API would accept an arbitrarily
historic date from a caller that sent one. Which is the whole reason the anchor
must not be looked up by it: a rule keyed on a date the domain does not constrain
is a rule the domain cannot keep. Reading the trend *as of* `startedOn` parts the
anchor from the figure the form previewed whenever a **Weight Measurement** is
stamped after it — the Goal then starts above where the User already stands and
reads >0% on day one, and a target between the two figures passes the form's own
rule and is refused by the backend naming a weight the UI never displayed
([#337](https://github.com/skrymer/tucker/issues/337)). That needs no backdating —
see Consequences for how far apart the two dates can drift.

Goal creation is already gated on a weight reading existing, so the trend is
always defined at creation and the anchor always answers. The **target** is
guarded **once**, against that same figure: at or above it, the Goal is already
reached. The refusal names `targetWeightKg` — the input the User typed it into —
because `Goal`'s own `target < startWeight` invariant throws a bare
`IllegalArgumentException`, which the Goal form would show above the submit as
though no input were at fault, having just previewed the starting weight. That
invariant stays as the backstop it is, reachable when a stored row is hydrated.

The EWMA **seeds** on its oldest reading, so the trend's first point *is* a raw
reading, and the most ordinary path there is — a new User logging their first
weigh-in and setting their first Goal the same day — anchors on it. That is a
limit of the smoothing rather than of this rule, and the alternatives are worse:
one reading is all that is known about that body, and a Goal with no anchor
cannot be drawn at all.

## Considered and rejected

- **Relabel only** — keep the raw start, rename the hero's "Now" → "Trend
  weight". The cheapest clarity win, but it leaves the day-one oddity intact: it
  only makes the raw-vs-trend comparison *legible*, not *clean*. A fresh Goal
  still reads ~2%.
- **Keep the raw start, reject bad targets server-side** — derive nothing; lean on
  the existing `targetError` 400 path for validation. Lower churn, but the form
  would preview a start (the raw reading) that the Goal card then contradicts (the
  stored trend), a few hundred grams to ~1 kg apart.

- **Anchor on the Trend Weight standing on `startedOn`** — shipped by
  [#331](https://github.com/skrymer/tucker/issues/331), reverted by
  [#337](https://github.com/skrymer/tucker/issues/337). It reads well: a plan that
  says it began on a date should start from where the body stood on that date, and
  anchoring a *backdated* Goal on today's trend hands the plan weeks of loss
  already banked, so it draws as near-target — or floors at the target outright —
  from its first day, which is the timeline asserting a claim the plan does not
  make (ADR 0029). What decides it is which case each defect lands in. **Nothing in
  the product backdates a Goal**: the shape the rule was written for exists only as
  a fixture, to get a drawn run out of one window, and there the cost of anchoring
  on today is a wrong-looking test that can seed through `GoalRepository` instead.
  The shape the rule broke is the one production creates, and there the cost is a
  wrong number a User is shown. Reverting leaves one residue, bounded by ADR 0014's
  ±1 tolerance at two days — see Consequences — and takes back the start weight, the
  day-one percentage, and the band of silently-refused targets.
- **Drop `startedOn` from `CreateGoalRequest`** and stamp it from the resolved
  client today, so the origin and the anchor are one instant by construction and
  the divergence is unrepresentable rather than merely unproduced. It is the
  stronger shape of this decision and it is not taken, for two costs and not for
  the tempting one: it is *not* that `Goal.started`'s future-date guard would go
  unreachable — a violation nothing can construct is a better guarantee than one
  that throws, and the guard's reach over hydration is through the constructor
  either way. It is that `GoalClientTodayApiTest` loses the case proving
  `startedOn` is judged against the *client's* day, which is ADR 0014's own rule;
  and that the Weight Timeline smoke posts a backdated `startedOn` to the live API
  to draw a multi-day run of plan, so it would need seeding another way. That second
  cost is small and should be named as such: `TestSupportController` is already a
  `@Profile("smoke")` controller whose other endpoints exist for exactly this class
  of reason, so the hook is a few lines in a file that exists. The first cost is the
  real one, and it is a recorded decision rather than a convenience.

## Consequences

- A new **`GET /api/weight/trend`** → `{ trendKg, asOf }` exposes the live trend
  (404 when no measurements exist, mirroring `/weight/latest`). The Goal form
  reads it to display the starting (trend) weight and to validate `target <
  trend` client-side; the backend re-derives the anchor at create time and
  remains authoritative. The form only ever starts a Goal today, so the trend it
  previews *is* the anchor — the two read the same figure, rather than agreeing
  by coincidence.
- The hero keeps `Start / Now / Target` (both Start and Now are now the trend) and
  gains a muted caption — "Tracked on your smoothed trend weight" — since the
  `/today` view is seen daily without the form's explanation.
- Redefines the **start weight** term in [`CONTEXT.md`](../../CONTEXT.md) (Goal,
  Goal Progress).
- **The trajectory's origin can sit up to two days early, and is left that way.**
  It takes **two devices**: one a day behind stamps `startedOn`, one a day ahead
  dates a **Weight Measurement**, and ADR 0014's ±1 applies to each, so the gap
  reaches two days — the same bound
  [0029](0029-a-weight-timeline-shows-the-body-and-the-intake-behind-it.md) records
  for the same tolerance on its own read side. One device cannot reach it: both
  dates come from one clock with the reading logged first, so the trend standing on
  `startedOn` and the live trend are the same point.
  The consequence is confined to `Goal.plannedWeightOn`, and so to the plan line the
  **Weight Timeline** draws. It is two effects rather than one: the line opens at the
  live trend, a figure the trend did not hold on `startedOn` — off by at least one
  EWMA step, `0.10 × |latest reading − prior trend|`, and a two-day window can admit
  more than one reading — and then runs the extra days of slope, up
  to `1.5 × 2/7 ≈ 0.43 kg` at `MAX_RATE_KG_PER_WEEK` and ~0.14 kg at a typical 0.5.
  **Goal Progress is untouched** — `percentComplete` is the start against the live
  trend, which this rule makes equal, and `plannedFinishDate` is projected from
  *today* and never reads `startedOn`. Clamping the date forward, or refusing it,
  would key a special case on the tolerance window and hand the User a 400 no input
  of theirs can clear.
- **`startedOn` stays unbounded below, and that is a limit of the API surface rather
  than a property of this rule.** A caller posting a `startedOn` months back gets a
  row whose plan line and **Goal Progress** disagree: the line floors at the target
  while progress reads 0%. The rule reverted here did not prevent that — with no
  trend point on or before such a date it fell through to the *earliest* point and
  floored the window just the same, and with a long enough history `standingOn` finds
  a genuine point months of slope away and floors it too — so the old rule held only
  where the backdate was short. It differed in the other half: progress then read a
  small non-zero percent rather than 0%.
  Nothing the product ships posts one: `GoalForm` posts `localToday()` and is the
  only `POST /api/goal` in the frontend.
- **`percentComplete` still under-reads early in a Goal, and
  [0032](0032-the-trend-weight-smooths-in-days-and-a-change-read-from-it-is-un-shrunk.md)
  deliberately does not fix it.** It is a difference between a *stored* start weight and
  the live trend, taken at two different depths in the smoothing, so it shows less
  movement than happened for the same reason every other trend difference did. That ADR
  divides the shortfall back out of the differences the domain *computes*; this one is
  half-stored, and the depth its anchor was captured at is not recoverable from the row.
  The remedy is the one below — replace the Goal — rather than rewriting history.
- **No data migration.** Single-user, one row; existing Goals are honest history
  under the old rule and are re-anchored simply by *replacing* the active Goal
  through the fixed UI. Reconstructing "the EWMA as of the start date" in SQL is
  fragile overkill for one row.

## References

- [0008 — Maintenance Mode is the absence of an active Goal](0008-maintenance-mode-is-the-absence-of-a-goal.md)
  — put reaching and the observed pace on the Trend Weight; this extends that to
  the Goal's start.
- [0002 — business logic belongs in the backend](0002-business-logic-belongs-in-the-backend.md)
  — the client can't compute the trend, so the derived start lives server-side.
- [`CONTEXT.md`](../../CONTEXT.md) — `Goal`, `Goal Progress`, `Trend Weight`,
  `Weight Measurement`.
- [#114](https://github.com/skrymer/tucker/issues/114) — the report this resolves.
- [#331](https://github.com/skrymer/tucker/issues/331) — anchored on the trend
  standing on `startedOn`; see Considered and rejected.
- [#337](https://github.com/skrymer/tucker/issues/337) — the divergence that
  reverted it, and the reason `startedOn` is the plan's origin and nothing more.
