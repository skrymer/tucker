# The Trend Weight smooths in days, and a change read from it is un-shrunk

The **Trend Weight**'s smoothing is expressed in **elapsed days** rather than per
reading, so a gap decays like a gap. And a *change* read between two of its points
is divided by the shrinkage the estimator itself would show over the same dates, so
two points at different depths in the same series measure the movement that actually
happened. The correction is capped at a factor of two: more than half of a movement
must have been seen before Tucker recovers the rest.

*Status: accepted; fixes [#293](https://github.com/skrymer/tucker/issues/293);
refines [0018](0018-adaptive-maintenance-averages-over-logged-days.md), which
deliberately left both halves out of scope; bounded by
[0031](0031-a-maintenance-below-the-bodys-basal-rate-is-not-a-measurement.md);
touches [0016](0016-goal-start-weight-is-the-trend-weight.md) and
[0008](0008-maintenance-mode-is-the-absence-of-a-goal.md) without changing either.*

## Context

`WeightTrend.from` decayed the EWMA **per reading**, seeded at the first
measurement:

```
trend = if (index == 0) m.weightKg else α·w + (1 − α)·trend        // α = 0.10
```

Nothing in it knew how much time passed between two readings. That is two distinct
defects, and they hit **disjoint populations by disjoint mechanisms**.

### The warm-up shrinks every difference, and it bites the daily weigher

For a steady trend of slope `s` per reading, the estimator's lag behind the truth is
`e(n) = (β/α)·s·(1 − βⁿ)` — nine readings' worth once settled, and *ramping* before
that. Two points at different depths therefore carry **different amounts of the
seed**, so the difference between them measures less than the real change:

```
t(b) − t(a) = (w(b) − w(a)) − s·(e(b) − e(a))
```

The lag itself is not the problem — ADR 0018's #292 amendment is right that a
settled lag is a *level* offset that cancels in a difference. The problem is that
during warm-up it has not settled, so it does not cancel.

Measured on production (`sonni`, review of 2026-09-06), anchor at the **5th**
reading and current point at the **18th**: **66.1%** of the real change. The engine
recorded Δtrend = −0.181 kg where the real movement was about −0.27 kg, the weight
term came out at 99.75 kcal instead of ~151, and that User's Calorie Budget was set
roughly **50 kcal/day tighter than the truth** — stamped `ADAPTIVE`.

### A gap decays like a day, and it bites the sparse weigher

Ten readings a day apart and ten a week apart produced identical trends. The cost is
not in the *change* — as above, the lag cancels there once settled — but in the
**level**, and it is far larger than it looks:

| steady 0.5 kg/week loss | per reading (before) | per day (after) |
| --- | --- | --- |
| daily weigher — trend noise sd | 0.116 kg | 0.116 kg |
| daily weigher — settled lag behind the body | −0.64 kg | −0.64 kg |
| **weekly** weigher — trend noise sd | 0.116 kg | 0.290 kg |
| **weekly** weigher — settled lag behind the body | **−4.50 kg** | −0.45 kg |
| **weekly** weigher — days to cover half a step change | **49** | 7 |

A weekly weigher's trend settled **4.5 kg** above their body. That is not the
"cosmetic" Protein Floor drift #293 describes — it is ADR 0008's *insistent*
reached-Goal fork firing **nine weeks late**, and ADR 0016's start weight anchored
4.5 kg high.

### The three candidates #293 offers do not do what it says

Measured on the same steady daily series that reproduces the production figure:

| candidate | captured at the production depth (4→17) | settled (20→33) |
| --- | --- | --- |
| status quo | 66.1% | 93.7% |
| 1 — bias-correct the seed, `÷ (1 − βⁿ)` | **69.0%** | **87.6%** |
| 2 — seed on the mean of the first 3 | **62.8%** | 93.1% |
| 3 — decay by elapsed days | **66.1%** (identical) | 93.7% |

- **Candidate 1 does not "remove consequence 1 entirely".** It buys three points at
  the production depth and is *worse* past about the eighth reading, because it
  converges to the nine-reading lag more slowly. It conflates the Adam-style
  *zero-init* bias correction with *lag* correction; seeding at the first reading is
  already the stronger warm-up device, and there is nothing left for that formula to
  fix.
- **Candidate 2 makes it worse.** On a falling series the mean of the first few
  readings sits above the truth, which adds lag.
- **Candidate 3 is a measured no-op for the live defect.** With daily readings
  `1 − β^Δt` *is* α by construction, so it returns today's number to the decimal on
  the very case #293 was raised from. It fixes the sparse weigher's level and
  nothing else.

So the issue's first consequence is fixed by **none** of its three candidates, and
its second by exactly one of them.

### What the defect actually is

The status quo is not merely lagging — it is a **shrinkage estimator**, and its
RMSE is indistinguishable from the unbiased alternatives (231 vs 230 kcal/day at the
production depth). You cannot buy bias down without buying variance up: 0.43 kg sd
is the information floor for an unbiased 14-day estimate at 0.5 kg/reading noise,
and the status quo only undercuts it by shrinking the signal too.

So the case for fixing this is **not accuracy**. It is that the error is

1. **one-directional** — it always understates movement, so it always tightens the
   Budget, and it compounds across a weekly feedback loop where symmetric noise
   would average out;
2. **depth-dependent** — two Users with identical bodies get different Budgets
   according to how long they have owned a scale; and
3. **stamped `ADAPTIVE`**, i.e. presented as measured.

Which is ADR 0031's argument arriving from the other side, and it is why that ADR
is this one's precondition: a trend that reports real movement produces larger
rises, and the invariant #332 left unguarded had to be closed first.

## Decision

1. **The smoothing is expressed in elapsed days.** Each reading moves the trend
   `1 − (1 − α)^gapDays` of the way toward itself, with `α = 0.10` **per day**.
   `SMOOTHING` keeps its name and its value, and gains a unit. Half-life ≈ 6.6 days.

   Keeping α at 0.10 *per day* is what leaves the daily weigher **unchanged to the
   limit of the arithmetic** — every daily row in the table above is identical — which
   is the property ADR 0018's #291 and #292 amendments each pinned themselves on. Not
   *byte*-for-byte, and the difference was measured rather than assumed:
   `1 − (1 − 0.10).pow(1.0)` lands two ulps off the literal `0.10`, so a forty-reading
   daily series diverges from the old one at the eleventh point by at most
   2.8 × 10⁻¹⁴ kg. That is below any figure Tucker shows or stores. The
   sparse weigher's trend becomes 2.5× noisier, and that is correct rather than a
   cost: one reading a week is less evidence, and the old behaviour concealed that
   by pretending a weekly weigher had a daily weigher's smoothing.

2. **A change read between two trend points is divided by the shrinkage the
   estimator would show over the same dates.** The factor is obtained by pushing a
   synthetic unit-per-day ramp through the same recursion on the User's own reading
   dates and measuring what survives between the same two points. It therefore
   depends on the **dates alone, never on the weights**, and is exact for a linear
   series at any cadence and any depth — measured at 100.0% for daily, twice-weekly
   and weekly series from the first reading onward.

   It applies to the two named operations that read a difference —
   `WeightTrend.changeSince` (the adaptive Maintenance weight term) and
   `WeightTrend.observedRateKgPerWeek` (the observed pace, **Pace Status** and
   **Drift Status**) — and to nothing else.

3. **The shrinkage is floored at 0.5, so the correction can at most double.** More
   than half of a movement must have actually been seen before Tucker recovers the
   rest; below that, most of the answer would be supplied by the formula rather than
   by the scale.

   **The floor sits inside the case this ADR exists for, not outside it**, and that is
   deliberate rather than a miss. A daily weigher's very first fortnight is the
   shallowest window the engine ever corrects, and it straddles the floor: with the
   anchor a full 14 days back the capture is **0.504** and the correction applies
   whole, and with it 13 days back — one weigh-in short, which is the ordinary case —
   it is **0.484** and the cap binds. So that User is corrected most of the way rather
   than all of it, and the shortfall shrinks to nothing over the following week as the
   window deepens. Measured on a running backend, not reasoned: a 1.3 kg fall across
   13 days reports 1.258, and the Budget lands at 2491.6 rather than the 2515 an
   uncapped correction would give — against the **2145.8** the old shrinkage produced.

## Considered and rejected

- **#293's three candidates**, each on the measurement above: candidate 1 buys three
  points and costs more later, candidate 2 is worse, candidate 3 is a no-op for the
  live defect. Candidate 3 is not *discarded* — it is decision 1, adopted for the
  second defect it does fix.

- **Correcting the trend's points rather than the differences taken from them.** It
  is the tidier shape — one lag-free series, and every difference then right by
  construction — and it is rejected on measurement. Correcting a *level* means
  estimating the slope from the data, and that is what Holt's linear method does:
  **702 kcal/day RMSE through the weight term, three times worse than the defect it
  fixes** (bias −0.005 kg, sd 1.276 kg). Brown's double exponential is better but
  overshoots to 110% mid-warm-up, and an over-claimed *rise* drives Maintenance down
  into ADR 0031's refusal. Correcting a difference estimates nothing, so it scales
  only the noise already present, by a factor that can be printed.

  | at the production depth | bias | sd | RMSE |
  | --- | --- | --- | --- |
  | status quo | −0.317 kg | 0.276 kg | 231 kcal/d |
  | Holt linear (level + slope) | −0.005 kg | 1.276 kg | 702 kcal/d |
  | **this decision** | −0.003 kg | 0.418 kg | **230 kcal/d** |
  | OLS slope over the window's raw readings | +0.004 kg | 0.430 kg | 237 kcal/d |

- **A least-squares slope over the window's raw readings.** Unbiased and no warm-up
  at all. Rejected because it splits the domain in two: a *level* estimator for the
  Goal, the Floor and the timeline, and a separate *rate* estimator for the engine —
  two answers to one question kept in agreement by hand, which is the shape
  [0029](0029-a-weight-timeline-shows-the-body-and-the-intake-behind-it.md) refuses.
  This decision keeps one estimator and corrects a reading taken from it.

  **It is the better estimator where this decision is weakest, and that is stated
  rather than buried.** The table above is taken at the production depth, where the
  two tie (237 against 230). At the depth the acceptance criteria actually name — a
  new User's first fortnight, 0→14 — OLS reads **230 kcal/day RMSE against this
  decision's 438**, because that is exactly where `MIN_CAPTURE` stops the correction
  half-done. What rescues the one-estimator argument is that OLS is no better at the
  cadence that matters most for it: ~389 kcal/day for a sparse weigher, where it has
  three or four readings to fit a line through. So the choice is not "worse
  everywhere", it is "worse for a fortnight, in exchange for not keeping two
  estimators in agreement forever".

- **Refusing below the 0.5 floor and holding, with a new `HeldReason`.** The first
  shape of decision 3, and it is ADR 0031's own idiom — do not publish a figure you
  cannot stand behind. Rejected on cost against reachability. Below the floor needs
  a weighing gap *and* two readings a day or two apart *and* ten of fourteen days
  logged; a new held reason costs sixteen files — a persisted enum with its
  migration test, the OpenAPI enum, `heldReason.ts` and its test, `ReviewLedgerItem`,
  `DaySummary`, `reviewLedger`, and a real-stack smoke. The cap is one expression and
  improves the **bias** everywhere it applies: the figure is never more than doubled,
  so nothing is manufactured, and where the smoothing shrank a movement the correction
  gives it back. Not *always* less shrunken, which is worth stating precisely because
  it is the tempting summary: capture exceeds 1.0 where a cadence widens — 1.18 for a
  daily weigher who switches to weekly — and there the division shrinks an
  overstatement rather than growing an understatement, which is right in both
  directions but is not the same sentence. That is a
  directional improvement, not a total one — variance rises with it, which is the RMSE
  cost the next bullet prices. What it gives up is that in that rare shape the published
  figure is still one-directionally low and still stamped `ADAPTIVE`; the bias is
  fixed where it is reachable in ordinary use rather than everywhere.

- **The measured RMSE crossover (shrinkage ≈ 0.65) as the floor.** It is the better
  number on RMSE — the correction loses below it — and it is the wrong number here,
  because a daily weigher's first fortnight sits at **0.484–0.504** and is the one
  case #293's acceptance criteria name. At 0.65 that User would be corrected by a
  third at most; at 0.5 they are corrected most of the way or all of it. A threshold
  that all but refuses its own acceptance criterion is the wrong threshold. That the
  correction is worse on RMSE around 0.5 (440 vs 352 kcal/day) is accepted rather
  than overlooked: it is the framing above holding, symmetric noise averaging out
  across reviews where one-directional shrinkage compounds.

- **Doing nothing.** Defensible on RMSE alone, and that is exactly why the Context
  states the defect as honesty rather than accuracy. Had the criterion been accuracy,
  this ADR would say *no change*.

## Consequences

- **`Maintenance`'s weight term reports real movement**, so a Calorie Budget that
  was set ~50 kcal/day tight for a new daily weigher is set correctly. The direction
  is always the same — the Budget **loosens** — because the defect always shrank.
- **For a sparse weigher the smoothing stops attenuating noise at all, and that
  re-prices a floor this ADR does not move.** Where the window's anchor is the User's
  only prior reading, `capturedBetween` is *exactly* the factor `smooth` applied, so
  dividing by it cancels the smoothing completely and the change is the plain
  difference of two scale readings. ADR 0018's #292 amendment justified
  `MIN_WEIGHED_DAYS = 1` on the opposite: that α = 0.10 held a 1.5 kg water swing to
  0.15 kg of trend, or 82 kcal/day. The same swing now moves the weight term by
  **825 kcal/day** across two readings a fortnight apart. That is not an argument
  against the correction — a trend that under-reports movement was under-reporting
  *real* movement by the same factor — but it is the premise that floor rested on, so
  re-pricing it is [#352](https://github.com/skrymer/tucker/issues/352) rather than
  something this ADR quietly absorbs. The daily weigher is not affected: `MIN_CAPTURE`
  binds in that first fortnight, and the multiplication is at most two.
  Two directions bound it unevenly in the meantime, which is worth saying plainly: an
  apparent *rise* drives Maintenance down into
  [0031](0031-a-maintenance-below-the-bodys-basal-rate-is-not-a-measurement.md)'s
  refusal, while an apparent *fall* inflates it with no invariant in the way.
- **The defect it fixes was understated in the issue, not overstated.** Shrinkage is
  positive feedback: the corrected Maintenance feeds a Budget, the Budget feeds the
  next window's intake, and the next review shrinks the result again. Solving the
  fixed point at the production capture of 0.661, a User who chose a 500 kcal/day
  deficit converges on **758**; at 0.504, on **992**. The issue's "roughly 50 kcal/day
  tighter" is one review's worth of it.
- **Every live derivation re-baselines; stored history does not move.**
  `goal.start_weight_kg` and `weekly_review.trend_weight_kg` are recorded values and
  stay honest history under the rule that produced them. No migration.
- **A Goal already running when this deploys re-baselines once, and that is a
  one-off rather than a migration.** Its `start_weight_kg` was captured under the old
  rule while the live trend moves to the new one — by little for a daily weigher and
  by up to the several kilograms the sparse-weigher table above names — so
  `percentComplete` steps on the first load, and ADR 0008's insistent reached-Goal
  fork can fire off the recalibration rather than off the body. ADR 0016's existing
  remedy covers it (replace the Goal, no data migration); what is new here is that it
  happens at all, which is why #293 wanted a deploy of its own to attribute a number
  change to.
- **Tucker now publishes corrected *changes* beside uncorrected *levels*, and nothing
  on screen says so.** The **Weight Timeline**'s line, the **Weekly Review** ledger's
  week-over-week kilograms and the Maintaining tile all show levels the smoothing
  shrank; **Goal Progress**'s observed "kg/week" and the engine's own weight term show
  movement it did not — up to twice apart for a new User. They were never the same
  quantity, and `CONTEXT.md`'s Trend Weight entry now states which reads are which.
  But a User who subtracts two drawn points and compares the result to the stated pace
  will find they disagree, and no surface explains why. Recorded rather than fixed:
  reconciling them means either correcting what is drawn — which is decision 2's
  rejected shape, and noisier — or drawing both, which is a surface decision of its own.
- **`Goal Progress.percentComplete` is explicitly unchanged**, and it has the same
  defect. It is a difference between a *stored* start weight and the live trend, so
  it under-reads for exactly this reason — but the depth the start weight was
  captured at is not recoverable from the row, so the correction cannot be applied to
  it without rewriting stored history. ADR 0016's existing remedy stands: re-anchor
  by replacing the Goal through the UI.
- **`WeightTrend.isEstablished()` is unchanged** — fourteen days *carrying a
  reading*. Per-day decay does not change what drawing a line needs, and this gates
  the **Weight Timeline**, not the engine.
- **`MIN_HISTORY_DAYS` keeps both of its jobs and stays at 14.** The 0.5 floor
  *joins* the day gate rather than replacing it: the day gate answers "is there a
  span to divide by", the floor answers "did the trend separate enough to read". A
  span of one day can clear the floor and must still be refused a rate.
- **Goal reaching latches on time for a sparse weigher**, and the **Protein Floor**
  stops being 2 g/kg of a trend 4.5 kg stale — both consequences of decision 1, and
  both on the *level*, which is why decision 2 does not reach them.
- **The drawn Weight Timeline changes shape for a sparse weigher** and is unchanged
  for a daily one.
- **ADR 0031 is reached by a smaller body movement.** Its worked numbers are correct
  as arithmetic and are not restated: 1.5 kg of *trend* rise against an 800 kcal
  average still gives −825 and a −25 kcal estimate. What moves is reachability —
  those figures were always stated in trend movement, and a trend that now reports
  the real movement reaches 1.5 kg off a **real** rise of about 1.5 kg where it
  previously needed ~2.3 kg. So `BELOW_BASAL_RATE` fires on a body movement roughly a
  third smaller.
- **`BELOW_BASAL_RATE`'s copy is deliberately not loosened.** Its caution was never
  only about the warm-up: ADR 0031's argument is that the log and the scale
  disagreeing has several causes and Tucker cannot tell which. Narrowing one of them
  does not license an accusation.
- Redefines **Trend Weight** in [`CONTEXT.md`](../../CONTEXT.md), which now states
  what the smoothing is measured against and what a change read from it is.

## References

- [#293](https://github.com/skrymer/tucker/issues/293) — the report this resolves,
  and whose three candidates are corrected above.
- [0018 — adaptive Maintenance averages over the days actually logged](0018-adaptive-maintenance-averages-over-logged-days.md)
  — its #291 amendment made the weight term's span the two readings it was measured
  between; this fixes what those two readings *measure*. Its #292 amendment named
  this as out of scope and measured the row (`weekly weigher, 3rd reading ever →
  0.145 kg of a real 1.0 kg fall`) that the model here reproduces.
- [0031 — a Maintenance below the body's basal rate is not a measurement](0031-a-maintenance-below-the-bodys-basal-rate-is-not-a-measurement.md)
  — the clamp this is ordered behind, and the invariant this makes more reachable.
- [0016 — Goal start weight is the Trend Weight](0016-goal-start-weight-is-the-trend-weight.md)
  — cites the seeding behaviour when arguing the start must be a trend point; the
  argument is unaffected, and `percentComplete` is recorded unchanged above.
- [0008 — Maintenance Mode is the absence of an active Goal](0008-maintenance-mode-is-the-absence-of-a-goal.md)
  — its insistent reached-Goal fork is what decision 1 stops firing weeks late.
- [`CONTEXT.md`](../../CONTEXT.md) — `Trend Weight`, `Weight Measurement`,
  `Maintenance`, `Goal Progress`, `Drift Status`.
