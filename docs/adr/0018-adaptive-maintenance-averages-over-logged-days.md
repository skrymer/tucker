# Adaptive Maintenance averages over the days actually logged

The weekly adaptive **Maintenance** correction averages logged intake over the
**days that actually carry an Entry**, not over the fixed two-week window; it only
runs with at least **10 of the trailing 14 days** logged — and, since
[#292](https://github.com/skrymer/tucker/issues/292), at least **1 of them weighed** —
and below either coverage floor it **holds the previous review's Maintenance** rather
than recompute.

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
  span; the principle is unchanged — the service still pre-divides nothing.) Since
  [#322](https://github.com/skrymer/tucker/issues/322) those two are **one** read:
  calories grouped by day, whose size is the logged-day count and whose values are
  the window's intake, so "a logged day" has one definition instead of two queries
  that had to agree about it.
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
- The window length (14) and the coverage floors (10 logged days, and since
  [#292](https://github.com/skrymer/tucker/issues/292) 1 weighed day) are tunable
  constants.

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

**A window the scale never saw corrects nothing** *(and, since
[#292](https://github.com/skrymer/tucker/issues/292), does not reach the correction at
all — the amendment below holds instead, so what follows describes the formula rather
than the engine)*. When no reading has been taken
since the window opened — whether the trend holds one point or fifty — both ends
resolve to the same point: the change is zero across zero days.
`WeightTrend.Change` holds the movement and its span as one value (a rate needs both,
and is wrong if they came from different spans), and the floor above is what turns
zero-across-zero-days into a zero term rather than a `0/0` — so the estimate is the
intake average with nothing on top, which is what the fixed divisor produced too. Whether evidence that thin should adapt *at all* is
[#292](https://github.com/skrymer/tucker/issues/292)'s question, and this amendment
leaves it exactly where it found it — answered in the amendment below, which refuses
to adapt on it.

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
than part of correcting a divisor. **Now fixed**, and by a decision of exactly that
shape: [ADR 0030](0030-a-deficit-maintenance-cannot-supply-is-suspended-never-floored.md)
refuses a rate that does not fit at the moment it is chosen, and **suspends** the
deficit — publishing Maintenance as the Budget — when Maintenance drifts under a Goal
already running. No floor is invented in either direction.

That closed the `IntakeTargets` invariant only. `Maintenance`'s own
`require(kcal > 0)` was a **second** way for the same endpoint to 400:
`adaptive` subtracts the energy of a *rising* trend from the intake average with
nothing clamping it, so a window that logs little and gains weight produces a
negative figure — roughly 1.5 kg of trend rise against an 800 kcal average, or
0.55 kg against 300. **Now closed too**, and by a decision of decision 3's shape
rather than a Budget policy:
[ADR 0031](0031-a-maintenance-below-the-bodys-basal-rate-is-not-a-measurement.md)
holds whenever the estimate falls below the User's own basal metabolic rate, which
is where it stops being a measurement of a body rather than merely where the
arithmetic stops producing a number. The invariant stays and becomes unreachable
through the engine.

**Out of scope, deliberately:** whether the window was weighed *often enough* for the
term to mean anything at all ([#292](https://github.com/skrymer/tucker/issues/292));
how much of a real change two EWMA points capture between them
([#293](https://github.com/skrymer/tucker/issues/293)); and
`WeightTrend.observedRateKgPerWeek`, which divides to `today` and so carries this
same asymmetry — it feeds **Drift Status** and goal pace, not Maintenance, so it is
a separate change to a separate surface.

## Amended by [#292](https://github.com/skrymer/tucker/issues/292): a window the scale never saw does not adapt

Decision 2 gave the **intake** term a coverage floor and decision 3 said what happens
below it. The **weight** term got neither. It entered the adaptive branch on there
being a trend anchor at all — which a single reading of any age satisfies — so the
degenerate case the #291 amendment describes above was not merely tolerated, it was
stamped `ADAPTIVE`.

Reachable today, and observed rather than argued. A User with one Weight Measurement
dated 15 days back, 13 logged days and 29,087.45 kcal in the window was driven against
a real backend: both ends of `changeSince` resolved to that single point, the term was
zero across zero days, and Maintenance came out at **2237.50** — the average intake to
the cent, with the Budget following. Tucker told somebody who was actively losing that
they maintain on what they eat. The dangerous User is the diligent food logger who
rarely weighs, and the failure is silent: every figure is plausible, and the basis badge
says the engine measured it.

**The floor: at least one of the trailing 14 days carries a Weight Measurement**
(`MIN_WEIGHED_DAYS = 1`, beside `MIN_LOGGED_DAYS = 10`). Below it the adaptive branch
does not run, and decision 3 applies unchanged — the prior review's Maintenance is
**held**, the seed only at genuine cold start. No new fallback path: the weighing floor
joins the condition the logging floor already gates.

**Why not a floor proportional to the window, as the intake term has.** The symmetric
answer — *n* of 14 days weighed — was rejected on a measurement, not on taste. The EWMA
smooths per *reading*, so the obvious worry is that a sparse weigher's trend understates
its own movement. Over a 14-day span, against a true 1.0 kg fall:

```
daily weigher, settled history      0.996 kg
weekly weigher, settled history     0.950 kg
weekly weigher, 3rd reading ever    0.145 kg
two readings ever, 14 days apart    0.100 kg
```

The lag an EWMA carries is a *level* offset, and in steady state both ends of
`changeSince` carry the same one, so it cancels and the slope survives whatever the
cadence. A settled weekly weigher's weight term is therefore already right, and a
10-of-14 floor would refuse it and hold their Budget forever — which is decision 3's own
failure mode, arrived at from the other side. What the bottom two rows show is a
transient of **short history**, not of sparse cadence: it bites while the anchor still
sits among a trend's first readings, and it is
[#293](https://github.com/skrymer/tucker/issues/293)'s, deliberately left there. Telling
the two apart is the whole reason this floor is one reading rather than seven.

**Why one reading is enough, and not merely the least that could be shipped.** The
neighbouring worry is the mirror of decision 2's: a term resting on a single
measurement should be noise-sensitive. It is not, because the #291 amendment's divisor
floor already bounds it — α is 0.10, so a 1.5 kg water swing moves the trend 0.15 kg,
and read over the window rather than its own span that is 82 kcal/day. The one risk
left for this floor to carry is *absence* of evidence, and one reading is exactly its
negation.

**Why hold rather than seed**, where ADR 0024 seeds. Its carve-out fires when there is
**nothing to hold** — the preceding review carries no **Intake Targets** after a
Calorie-Tracking stretch — and re-anchors on the body the User has now. Neither half
applies here. There is a figure to hold, computed when the scale had last been looked
at; and "the body the User has now" is precisely what this User has not measured, so
`Maintenance.seed` would be fed the same stale Trend Weight while discarding an
adaptively corrected figure for a formula. Holding is also recoverable in one step: one
weighing re-opens the adaptive path the same day.

**What it costs.** A User who logs diligently and never weighs again holds forever. That
is decision 3's contract rather than a regression of it — the Budget moves with
physiology, not with logging diligence — but it is worth saying plainly that the engine
would rather be a week stale than confidently wrong. Tucker does **not** say which floor
held it: `HELD` stays one value, though the remedy differs (weigh once / log more), and
a basis that explains itself is a surface decision this ADR does not take.

**Reversed by [ADR 0031](0031-a-maintenance-below-the-bodys-basal-rate-is-not-a-measurement.md)**,
on evidence this amendment did not have. Holding silently was defensible while both
remedies — *weigh once*, *log more days* — were ones a User can guess from their own
behaviour. ADR 0031 adds a third, `BELOW_BASAL_RATE`, whose remedy is *log your days
completely*, and that one is unguessable: the User logged ten of fourteen days and weighed
in, so by every signal available to them they did everything right and the Budget froze
anyway. A `HELD` Maintenance therefore now records **which** condition held it, and `/`
names the remedy beside the Budget it is holding.

**Byte-for-byte unchanged** for every case that adapts today: the floor's negation is
exactly the case where both ends of `changeSince` resolve to one point, which contributed
a zero term before and produces a `HELD` review now.

**Out of scope, still:** how much of a real change two EWMA points capture between them
([#293](https://github.com/skrymer/tucker/issues/293)), and what a Calorie Budget does
when the arithmetic runs it to zero
([#305](https://github.com/skrymer/tucker/issues/305)). Both are about refusing to
publish a figure that cannot be trusted, and both fire on evidence this floor reads as
sufficient — #305 on *good* evidence and a Goal steeper than the body can support — so
they are separate decisions rather than parts of this one.

## References

- [#129](https://github.com/skrymer/tucker/issues/129) — the report this resolves.
- [#291](https://github.com/skrymer/tucker/issues/291) — the weight term's span,
  amended above.
- [#292](https://github.com/skrymer/tucker/issues/292) — the weight-coverage floor,
  amended above; [#293](https://github.com/skrymer/tucker/issues/293) and
  [#305](https://github.com/skrymer/tucker/issues/305) are what it deliberately leaves.
- [0031 — a Maintenance below the body's basal rate is not a measurement](0031-a-maintenance-below-the-bodys-basal-rate-is-not-a-measurement.md)
  — extends decision 3 with a third condition to hold on, and reverses the #292
  amendment's ruling that a basis does not explain itself.
- [0008 — Maintenance Mode is the absence of an active Goal](0008-maintenance-mode-is-the-absence-of-a-goal.md)
  — the adaptive engine this refines; keeps its weekly cadence and trend basis.
- [0002 — business logic belongs in the backend](0002-business-logic-belongs-in-the-backend.md)
  — the correction is a backend domain rule; the UI only presents the Budget.
- [`CONTEXT.md`](../../CONTEXT.md) — `Maintenance`, `Weekly Review`, `Trend
  Weight`, `Entry`.
