# Adaptive Maintenance averages over the days actually logged

The weekly adaptive **Maintenance** correction averages logged intake over the
**days that actually carry an Entry**, not over the fixed two-week window; it only
runs with at least **10 of the trailing 14 days** logged, and below that coverage
it **holds the previous review's Maintenance** rather than recompute.

*Status: accepted; refines the adaptive engine of
[0008](0008-maintenance-mode-is-the-absence-of-a-goal.md), honours
[0002](0002-business-logic-belongs-in-the-backend.md).*

## Context

The adaptive Maintenance estimate is an energy balance over a 14-day window:

```
Maintenance = averageDailyIntake + (−ΔtrendWeightKg × 7700 ÷ days)
```

The intake term *was* `totalLoggedCalories ÷ 14` — a fixed divisor
([#129](https://github.com/skrymer/tucker/issues/129)). But a day with no Entry
contributes 0 to the numerator while still counting in the denominator, so it
reads as a **zero-calorie day** and drags the average — and therefore Maintenance
and the Calorie Budget — **low**. Meanwhile the weight-change term already spans
the full calendar window: the Trend Weight is an EWMA over Weight Measurements,
built independently of Entry logging, so the scale has already integrated *real*
eating on the un-logged days. The two terms were measuring different spans.

Worked example — true Maintenance ~2400 kcal, the user eats ~2400 every day but
logs only 10 of the 14 days:

```
÷14 (old):          24000 / 14 = 1714   → ~700 kcal too low, Budget drops with it
÷loggedDays (new):  24000 / 10 = 2400   → correct
weight term:        −Δtrend × 7700 / 14  (unchanged — full calendar span; amended below)
```

## Decision

1. **Average over logged days.** `averageDailyIntake = totalLoggedCalories ÷
   loggedDayCount`, where a *logged day* is a calendar day in the window with ≥1
   Entry. The weight-change term keeps `days = 14` (the calendar span). This
   assumes un-logged days resemble logged ones (missing-at-random); since the
   scale already captured the real eating, scaling the logged average up to the
   window is the unbiased estimate. *(Amended by
   [#291](https://github.com/skrymer/tucker/issues/291) — the weight term's span is
   measured between the two readings it was taken from rather than fixed at 14;
   see below.)*

2. **A coverage floor — ≥ 10 of 14 days.** Dividing by logged days reintroduces
   the opposite risk: with only one or two logged days the average is set by one
   or two noisy samples (a single logged binge would set Maintenance high). The
   intake term sets the *level* of Maintenance (~2400) while the weight term only
   nudges it (~±500), so a thin sample makes the level swing. Adapt only with
   enough coverage.

3. **When it can't adapt, hold the prior Maintenance.** Whenever the adaptive path
   doesn't apply — below the coverage floor, no trend anchor 14 days back yet, or
   ten-plus days logged only as zero-calorie (no intake signal) — the previous
   review's Maintenance is carried forward unchanged (basis `HELD`). The BMR seed
   is a *cold-start* device; reverting to it once history exists would make the
   Budget **yo-yo with logging diligence rather than physiology** — a sparse-logging
   fortnight would jump the Budget by hundreds of kcal and back — which contradicts
   the engine's contract that *"the Budget only moves when the trend moves"* and is
   *"held steady"* between cadence ticks. The seed therefore applies only at genuine
   cold start, when there is no prior review to hold. The held value is the most
   recent review dated *strictly before* the one being computed, never a same-day or
   later-dated record.

## Considered and rejected

- **Keep the fixed ÷14** — the status quo, i.e. the bug: missed logging silently
  shrinks the Budget.
- **Restrict the window to the logged span** (measure intake and weight change
  only between the first and last logged day) — mid-window gaps still moved the
  scale, so this shifts the endpoints without removing the gap problem, and is
  more complex.
- **Impute each un-logged day** (fill with the seed or the logged average, then
  ÷14) — equivalent to ÷loggedDays when you impute the logged average, but adds
  machinery and a second assumption for no gain.
- **Below the floor, revert to the BMR seed** — rejected for the yo-yo above;
  holding the prior value keeps the Budget stable through an under-logged week.

## Consequences

- Two new repository capabilities: counting the distinct logged days in the window
  (alongside the existing intake sum), and fetching the most recent review strictly
  before a date (the held value). `Maintenance.adaptive` takes the raw total and the
  two divisors (`totalIntakeKcal`, `loggedDays`, `trendWeightChangeKg`, `windowDays`)
  so the whole two-span energy balance lives in the domain rather than being
  pre-divided by the service. (Since
  [#291](https://github.com/skrymer/tucker/issues/291) the change and its span are one
  `WeightTrend.Change` and `windowDays` is the window being corrected rather than that
  span; the principle is unchanged — the service still pre-divides nothing.)
- A new engine fallback path (hold the prior review's Maintenance) and a
  `Maintenance.Basis.HELD` value, surfaced alongside `FORMULA_SEED` / `ADAPTIVE`
  as the review's basis. (Originally stamped into the review's free-text `note`;
  [#130](https://github.com/skrymer/tucker/issues/130) promoted it to a structured
  `maintenanceBasis` API field and dropped the `note`, so the frontend reads the
  basis instead of parsing prose — honouring [0002](0002-business-logic-belongs-in-the-backend.md).
  Its V7 backfills each existing row's basis from the note it was stamped with — a
  faithful label copy, not a recomputation — so the "No data migration" note below
  still holds: no historical Maintenance value is rewritten.)
- Redefines **Maintenance** in [`CONTEXT.md`](../../CONTEXT.md).
- **No data migration** (single-user, ADR 0012): past reviews remain honest
  history under the old rule; the next review recomputes today under the new one.
- The window length (14) and the coverage floor (10) are tunable constants.

## Amended by [#291](https://github.com/skrymer/tucker/issues/291): the weight term spans the two readings it was measured between

Decision 1 fixes the weight term's divisor at 14 and calls it the calendar span.
That reads as a choice between *calendar* days and *logged* days, and it is — but
it also quietly assumes there is a trend point **at the window's start**, and
another **on the review date**. Usually there is neither.

Both ends move, and they move independently:

- The near end came from `WeightTrend.asOf(on − 14)`, the latest point **on or
  before** that date. Weigh weekly, or skip a fortnight, and the anchor sits at day
  −20, −40 or −60 while the divisor stays 14.
- The far end is `WeightTrend.latest()` — the most recent reading, which can be any
  number of days old. A reading cannot be dated after the User's own today, so it is
  at or a little either side of the review date, and usually well before it.

Both ends now come from one operation, `WeightTrend.changeSince(from)`, which returns
the movement and its span together; `asOf` is private behind it.

So the numerator is a movement between two **reading days**, and the divisor has to
be the days between those same two readings. Anything else divides a change by days
it was not measured across. Steady 0.5 kg/week loss, review on day 0:

```
weighing weekly at −20, −13, −6      weighing at −20, and again today
Δ = 1.0 kg over the 14 days seen     Δ = 1.4 kg over the 20 days seen
÷14 (as decided):   550  ✓ (luck)    ÷14 (as decided):   785  ✗ 43% high
÷20 (to review):    385  ✗ 30% low   ÷20 (to review):    550  ✓
÷14 (two readings): 550  ✓           ÷20 (two readings): 550  ✓
```

Measuring to the **review date** — the first shape this amendment was written in —
fixes the right-hand column and breaks the left. It is the mirror of the fixed 14:
each is correct only for the one weighing habit that happens to put a reading on the
date it divides to.

**Why the fixed 14 was safe for as long as it was**: under daily weighing both
readings land where the constant assumed, and the span *is* 14. That case is
byte-for-byte unchanged, which is what pins this as a refinement of decision 1
rather than a reversal of it.

**This is decision 1's own missing-at-random argument, applied to the other term.**
Intake divides by logged days and the result is *scaled up* to the window, on the
premise that unlogged days resemble logged ones. The weight term now does the same:
it reads the rate the scale actually observed and lets it stand for the days with no
reading, rather than assuming those days held no imbalance at all — which is exactly
what spreading a fixed change across them does.

**This is not the rejected "restrict the window to the logged span".** That one
moved *both* terms' endpoints onto days carrying an Entry, and was rejected because
mid-window gaps still moved the scale — shifting the endpoints without removing the
gap. Here the intake window is untouched, fixed at 14 days; only the weight term's
divisor is brought into line with the two readings its numerator was already
measured between, which is a mismatch rather than a window.

**The divisor has a floor at the window, and it is load-bearing.** The fixed 14 was
quietly acting as one: with an anchor at `on − 14` and a second reading the next day,
the observed span is *one day*, and read at its own rate a 0.2 kg EWMA step off one
salty-dinner reading claims 1540 kcal/day of imbalance for a fortnight the scale
barely saw. Left unbounded it is not merely wrong but fatal — a 2 kg overnight swing
in the other direction drives the estimate itself below zero, `Maintenance`'s own
`require(kcal > 0)` refuses it, and `GET /api/summary` 400s for every day the gap
lasts, with the review never written.
So the weight term divides by the observed span **or the window, whichever is
longer**: evidence about less than the window is not evidence about the window. That
restores the property this amendment started from — the correction only ever
*shrinks* the term, never grows it — and keeps every short-span case reading exactly
as it did before.

**A window the scale never saw corrects nothing.** When no reading has been taken
since the window opened — whether the trend holds one point or fifty — both ends
resolve to the same point: the change is zero across zero days.
`WeightTrend.Change` holds the movement and its span as one value (a rate needs both,
and is wrong if they came from different spans), and the floor above is what turns
zero-across-zero-days into a zero term rather than a `0/0` — so the estimate is the
intake average with nothing on top, which is what the fixed divisor produced too. Whether evidence that thin should adapt *at all* is
[#292](https://github.com/skrymer/tucker/issues/292)'s question, and this amendment
leaves it exactly where it found it.

`Maintenance.adaptive` therefore takes that one `Change` in place of the loose
`trendWeightChangeKg` / `windowDays` pair, alongside the window it is correcting —
which is what the floor above is measured against, and no longer doubles as the
change's own span. The mismatch this amendment fixes was two
numbers from different spans meeting in one formula; a signature that cannot express
the mismatch is what stops it coming back.

**A consequence the floor does not cover, and is not fixed here.** The floor bounds the
divisor from below, so it bounds the correction the *short*-span direction can add.
The long-span direction — the one this amendment exists for — moves the estimate the
other way: a larger divisor shrinks a falling trend's positive term and lowers
Maintenance, and with it the Budget. A User on a steep deficit whose logged average is
already close to it can therefore cross `IntakeTargets`' `require(calorieBudgetKcal > 0)`
where the fixed 14 kept them above it, and `GET /api/summary` 400s until they log more,
weigh in, or ease the Goal. This widens a hole rather than opening one — a genuinely
flat trend produced the same refusal before — and the fix is a policy about what a
Budget does when the arithmetic runs it to zero, which is a decision of its own rather
than part of correcting a divisor.

**Out of scope, deliberately:** whether the window was weighed *often enough* for the
term to mean anything at all ([#292](https://github.com/skrymer/tucker/issues/292));
how much of a real change two EWMA points capture between them
([#293](https://github.com/skrymer/tucker/issues/293)); and
`WeightTrend.observedRateKgPerWeek`, which divides to `today` and so carries this
same asymmetry — it feeds **Drift Status** and goal pace, not Maintenance, so it is
a separate change to a separate surface.

## References

- [#129](https://github.com/skrymer/tucker/issues/129) — the report this resolves.
- [#291](https://github.com/skrymer/tucker/issues/291) — the weight term's span,
  amended above.
- [0008 — Maintenance Mode is the absence of an active Goal](0008-maintenance-mode-is-the-absence-of-a-goal.md)
  — the adaptive engine this refines; keeps its weekly cadence and trend basis.
- [0002 — business logic belongs in the backend](0002-business-logic-belongs-in-the-backend.md)
  — the correction is a backend domain rule; the UI only presents the Budget.
- [`CONTEXT.md`](../../CONTEXT.md) — `Maintenance`, `Weekly Review`, `Trend
  Weight`, `Entry`.
