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
weight term:        −Δtrend × 7700 / 14  (unchanged — full calendar span)
```

## Decision

1. **Average over logged days.** `averageDailyIntake = totalLoggedCalories ÷
   loggedDayCount`, where a *logged day* is a calendar day in the window with ≥1
   Entry. The weight-change term keeps `days = 14` (the calendar span). This
   assumes un-logged days resemble logged ones (missing-at-random); since the
   scale already captured the real eating, scaling the logged average up to the
   window is the unbiased estimate.

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
  pre-divided by the service.
- A new engine fallback path (hold the prior review's Maintenance) and a
  `Maintenance.Basis.HELD` value, recorded in each review's note for transparency
  alongside `FORMULA_SEED` / `ADAPTIVE`.
- Redefines **Maintenance** in [`CONTEXT.md`](../../CONTEXT.md).
- **No data migration** (single-user, ADR 0012): past reviews remain honest
  history under the old rule; the next review recomputes today under the new one.
- The window length (14) and the coverage floor (10) are tunable constants.

## References

- [#129](https://github.com/skrymer/tucker/issues/129) — the report this resolves.
- [0008 — Maintenance Mode is the absence of an active Goal](0008-maintenance-mode-is-the-absence-of-a-goal.md)
  — the adaptive engine this refines; keeps its weekly cadence and trend basis.
- [0002 — business logic belongs in the backend](0002-business-logic-belongs-in-the-backend.md)
  — the correction is a backend domain rule; the UI only presents the Budget.
- [`CONTEXT.md`](../../CONTEXT.md) — `Maintenance`, `Weekly Review`, `Trend
  Weight`, `Entry`.
