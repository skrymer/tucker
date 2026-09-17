# Goal start weight is the Trend Weight on its start date

A Goal's **start weight** is the **Trend Weight standing on its start date**,
derived by the backend — not the raw scale reading the user entered that day.

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
*trend* point. The backend sets `startWeightKg` from the **Trend Weight** (the
EWMA over every measurement) standing on the Goal's start date — originally the
*live* trend at the moment of creation, amended by
[#331](https://github.com/skrymer/tucker/issues/331) once a backdated start
showed the two can part (see below); `CreateGoalRequest` no longer carries it.
A fresh Goal then reads exactly 0% (start == now), and the whole computation is
trend-to-trend.

This mirrors F3 dropping the user-entered `caloriesPer100g` once calories became
a derived value (`4P+4C+9F`), and it honours
[0002](0002-business-logic-belongs-in-the-backend.md): the client *can't* compute
the trend (it would have to re-implement the domain EWMA), so the value it can't
own moves to the backend. The raw reading is not lost — it lives on in the
**Weight-Measurement** history; it simply stops being the Goal's anchor.

**The anchor is the trend standing on the Goal's start date**, which is the live
one for a Goal started today with nothing weighed since. Every Goal the app creates
starts today — `GoalForm` posts `localToday()`, and `Goal.started` refuses anything
later — so that is the usual case, but it is not a guarantee, and the two part in
two ways. One needs a *backdated* start, which nothing in the product produces and
which the suites use to get a drawn run out of one window. The other needs no
backdating at all: a reading dated *ahead* of the start date, which ADR 0014's ±1
tolerance admits across two devices, where the anchor is the older point the Goal
actually began on. Anchoring those on today's trend was a defect rather than a
liberty: the plan then begins weeks of loss above where the User already stands, so
it reads as near-target — or floors at the target outright — from its first drawn
day, which is the timeline asserting a claim the plan does not make (ADR 0029).
Before the first reading the trend stands nowhere, and its **earliest** point
answers — the first thing known about this body, and never the latest, which is the
figure that caused the defect.

That first point is the standing sentence's exception, and a reachable one: the EWMA
**seeds** on the oldest reading, so the trend's first point *is* a raw reading, and
any start date before the second reading anchors on it — including the most ordinary
path there is, a new User logging their first weigh-in and setting their first Goal
the same day. That was equally true under the live-trend rule, so it is a limit of
the smoothing rather than of this amendment, and the alternatives are worse: one
reading is all that is known, and a Goal with no anchor cannot be drawn at all.

Goal creation is already gated on a weight reading existing, so the trend is always
defined at creation. The **target** is guarded **twice**, because the two figures
part exactly when the anchor does: at or above the **live** trend the Goal is
already reached, and at or above the **anchor** the plan would run upward from where
it began. They are one figure and one check whenever nothing has been weighed since
the start; two after weight *gain* across a backdated start, and — without any
backdating — whenever a reading is dated after the start, which ADR 0014's ±1
tolerance admits across two devices. Both refusals name `targetWeightKg`, which is
what the second guard is *for*: the `target < startWeight` invariant alone throws a
bare
`IllegalArgumentException`, and the Goal form would show that above the submit — as
though no input were at fault — having just previewed a starting weight the User was
never refused against.

## Considered and rejected

- **Relabel only** — keep the raw start, rename the hero's "Now" → "Trend
  weight". The cheapest clarity win, but it leaves the day-one oddity intact: it
  only makes the raw-vs-trend comparison *legible*, not *clean*. A fresh Goal
  still reads ~2%.
- **Keep the raw start, reject bad targets server-side** — derive nothing; lean on
  the existing `targetError` 400 path for validation. Lower churn, but the form
  would preview a start (the raw reading) that the Goal card then contradicts (the
  stored trend), a few hundred grams to ~1 kg apart.

## Consequences

- A new **`GET /api/weight/trend`** → `{ trendKg, asOf }` exposes the live trend
  (404 when no measurements exist, mirroring `/weight/latest`). The Goal form
  reads it to display the starting (trend) weight and to validate `target <
  trend` client-side; the backend re-derives the anchor at create time and
  remains authoritative. The form only ever starts a Goal today, so the trend it
  previews is the anchor unless a reading is dated after that day.
- The hero keeps `Start / Now / Target` (both Start and Now are now the trend) and
  gains a muted caption — "Tracked on your smoothed trend weight" — since the
  `/today` view is seen daily without the form's explanation.
- Redefines the **start weight** term in [`CONTEXT.md`](../../CONTEXT.md) (Goal,
  Goal Progress).
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
