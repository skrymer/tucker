# Maintenance Mode is the absence of an active Goal

Tucker only ever modelled a **cut**: a weight-loss **Goal** derives a deficit, and
the **Calorie Budget** = **Maintenance** − that deficit. Nothing happened when the
user actually *reached* the target — the deficit kept being applied below goal
weight. F7 adds the other side of the story: what the app *is* once there's no
weight to lose.

This ADR records that design, settled in a design interview. The decision that
shapes everything else is structural: **Maintenance Mode is not a thing you
create — it is the state you are in whenever no Goal is active.** The domain term
it introduces (**Maintenance Mode**), the **reached** Goal concept, and **Drift
Status** live in [`CONTEXT.md`](../../CONTEXT.md).

## Maintenance Mode is a derived state, not an aggregate

When no Goal is active, the user is *maintaining*. There is no deficit to chase:

- **Calorie Budget** = **Maintenance** (the deficit subtraction is skipped).
- **Protein Floor** still applies — `2 g/kg × Trend Weight` — now computed
  directly from the trend, **decoupled from the Goal** that used to carry it.

A Goal becomes the *temporary* weight-change campaign layered over a maintenance
baseline, rather than the only state the app understands. This makes Tucker
usable as a pure maintenance tracker by someone who never sets a Goal at all —
the same code path serves "reached my goal and stopped" and "just holding
steady."

We considered three shapes and rejected two:

- **A Goal with `rate = 0`.** Relax the rate validator so maintenance is a Goal
  whose deficit is zero. Rejected: it makes every Goal-derived reading degenerate
  in maintenance (kg-to-go is 0, the planned finish date is today, Pace Status is
  undefined), so it needs special-casing *anyway* — a fake Goal that every
  consumer must learn to ignore.
- **A first-class `MaintenanceState` aggregate.** A distinct persisted state with
  its own table/flag. Rejected: it introduces a *second* thing that can be
  "active" alongside Goal, and a *second* source of truth for Budget/Floor — with
  illegal in-between states (both active, neither active) and two code paths that
  must agree. The interview started here ("MaintenanceState is the correct way"),
  but the observation that *you can be in maintenance without ever creating
  anything* is precisely what says it isn't an object you instantiate — it's the
  absence of a Goal.
- **No active Goal = Maintenance Mode** *(chosen)*. One source of truth, no new
  aggregate, no illegal states. The cost — that "reached a goal" and "never set
  one" both look like "no active Goal" — is paid by the reached Goal staying in
  history (see below), which is enough to celebrate the milestone and surface the
  durable status.

**Pure maintenance defends no target weight.** The Budget simply tracks whatever
Maintenance currently is; there is no stored target to pull the user back to.
Defending a target weight (a guard band that nudges the Budget when the trend
leaves a range) is a larger feature and is **out of scope** — Maintenance Mode
v1 is "hold at current Maintenance," which needs no stored state.

## Reaching a Goal latches; the user resolves it by an explicit fork

A Goal is **reached** when the live **Trend Weight** first meets its target
(`Goal.isReachedAt` → `trend ≤ target`). Two deliberate decisions around this:

**Detection is event-driven and complete.** The current Trend Weight is the
latest EWMA point, which *only* moves when a **Weight Measurement** is added,
edited, or deleted — not the clock, not a review. So the only moment the trend can
cross the target is on a measurement write, giving one clean write point: on
Weight Measurement create/edit, recompute the trend and stamp the active Goal's
new `reachedOn` if it just crossed. No side-effects on GET, no scheduler, no
crossing ever missed. No debounce is added — the EWMA smoothing (10% weight per
reading) already absorbs a single low morning weigh-in, so a crossing is real.

**Reaching latches, and the transition is confirmed, not automatic.** `reachedOn`
is set once and never unset while the Goal is active, so the trend drifting a hair
back above target doesn't make the surfaced signal flicker. The app does **not**
silently flip into maintenance: reaching a goal weight is a meaningful event and a
user decision, and a silent auto-switch would also create a flapping state machine
(auto-deactivate at target, auto-reactivate when the trend rises again). Instead
the user is presented an **insistent two-way fork** — *Switch to maintenance*
(deactivate the Goal → Maintenance Mode) or *Set a lower goal* (replace the Goal;
the new one has `reachedOn = null`, resetting the latch). The Goal stays active
and reached until they choose; there is **no third "dismiss"** state, because
reaching the target genuinely is a fork, not something to ignore. The
deterministic core is preserved — the math never *guesses* the transition; a human
makes the one judgment call.

## A Goal lifecycle change recomputes today's review

The Budget shown on `/today` is read from the latest **Weekly Review** record and
is frozen between reviews ([0002](0002-business-logic-belongs-in-the-backend.md),
"held steady in between"). If switching to maintenance only deactivated the Goal,
`/today` would keep showing the old *deficit* Budget for up to seven days until
the next lazy catch-up — the user "graduates" and their calories don't move.

So a **Goal lifecycle change is a third review trigger**, alongside (1) weekly
lazy catch-up and (2) manual "run now": switching to maintenance
**force-recomputes today's review, overwriting any existing same-day record**.
`runReview(today)` is idempotent (returns an existing same-day record unchanged),
so this must *overwrite*, not no-op. "Held steady in between" still holds for
clock ticks; a deliberate Goal event is exactly what *should* move the Budget
mid-week. The Budget jumps up immediately and surfaces as a `BudgetChange`.

The same latent latency affects creating or replacing a Goal mid-cut, so the
trigger covers **every Goal lifecycle change**, not just the maintenance switch:
`GoalService.replaceActiveGoal` and `deactivateActiveGoal` both force-recompute
today's review. (The maintenance switch was the motivating case in the F7 design
interview; broadening the trigger to create/replace was tracked as
[#61](https://github.com/skrymer/tucker/issues/61) and shipped with F7.)

## The adaptive engine is unchanged; reviews keep their weekly cadence

The adaptive Maintenance formula —
`Maintenance = avgDailyIntake + (−trendChange × 7700 / days)` — reconstructs
Maintenance from intake and observed weight change and **never references the
deficit or the Goal**. So it needs no change in Maintenance Mode: only the Budget
step drops the subtraction. (The intake term's averaging was later refined to
divide by the days actually logged, with a coverage floor and a hold-prior
fallback — see [ADR 0018](0018-adaptive-maintenance-averages-over-logged-days.md);
the cadence and trend basis here are unchanged.)

This also settles the "cadence with no deficit to chase" question: keep the
**same weekly cadence**. The formula is a *stabilizing feedback loop* even with no
Goal — drift up and the estimated Maintenance comes out below intake, pulling next
week's Budget down; drift down and it pulls the Budget up. Stopping reviews in
maintenance would freeze the Budget and let drift go uncorrected, so weekly review
is doing real work. (This holds the user near *wherever they are*, with no memory
of a number — consistent with "pure maintenance defends no target.")

## Surfacing drift, and the API shape

In a cut, **Pace Status** classifies the observed trend slope against the planned
rate. Maintenance Mode is the same thing with a planned rate of **zero**, so
**Drift Status** reuses the existing observed-pace machinery (28-day trend slope,
withheld until 14 days of measurements): *holding* inside a ±0.1 kg/week band,
*drifting up* / *drifting down* outside it. It is a **displayed status, not an
alert** — the self-correcting Budget already responds. Tucker deliberately does
**not** attribute *why* the weight moved (muscle vs fat vs water): that needs
body-composition data it doesn't have, and inferring muscle from a lift (e.g.
"bench went up, so it's muscle") is rejected — early strength gains are neural,
not hypertrophic, and a training log is a separate bounded context that stays out
of scope. The honest reading the app *can* give is the energy balance (implied
surplus/deficit from intake + trend); the cause is the user's to interpret.

The read model is exposed by **composing existing per-aggregate reads**, not a new
endpoint:

- `GET /api/goal` and `GET /api/goal/progress` return **404** in Maintenance Mode;
  the client treats "no active Goal" as the signal it's maintaining. `GET
  /api/goals` still lists history, including the reached Goal.
- `GET /api/summary` is unchanged in shape but gains optional `driftStatus` +
  `observedRateKgPerWeek`, populated only in Maintenance Mode. This follows the
  "per-aggregate endpoints, compose on the client" rule and the precedent that the
  summary already surfaces cross-aggregate read data (Budget/Floor from the Weekly
  Review, `budgetChange`).

## Where it surfaces — both `/today` and `/profile`, with distinct roles

- **`/today`** carries the *moment* and the *daily state*: the reached banner (the
  two-way fork, shown while the active Goal is reached-but-unresolved), and — once
  maintaining — a calmer "Maintaining" card that *replaces* the Goal-Progress card,
  showing the Trend Weight and Drift Status, with Budget/Floor rendering as normal.
- **`/profile`** carries the *durable status* and *re-entry*: a persistent "you're
  maintaining since {date}" with a "Start a goal" CTA, so a cut can be re-entered
  any time — not only from a banner the user might never see. The banner's "Set a
  lower goal" action and this CTA land on the same Goal-creation flow.

## Boundary rulings

- A loss Goal whose target is **not below** the current Trend Weight is rejected at
  creation (it isn't a loss, and would stamp `reachedOn` on the next measurement).
- A Goal can be reached **before 14 days** of measurements exist (the reached
  check uses the live trend, which exists from day one). Maintenance Mode is
  entered normally; Drift Status reads "gathering data" until 14 days exist, and
  the maintaining card still shows Budget/Floor.

## Consequences

- **Backend:** a nullable `reached_on` column on `goal` (migration + jOOQ regen),
  stamped on Weight Measurement create/edit when the active Goal crosses target;
  the Weekly Review gains a **no-active-Goal branch** (`Budget = Maintenance`,
  `Floor = 2 g/kg × trend`); a deactivate-to-maintenance action that
  force-recomputes today's review (overwrite); Goal-creation validation that the
  target is below the current trend; `driftStatus` + `observedRateKgPerWeek` added
  to the summary response, derived from the existing 28-day slope classified
  against zero; `GET /api/goal` + `/api/goal/progress` return 404 when no Goal is
  active. Regenerate the OpenAPI spec and the typed `nuxt-open-fetch` client after
  the response change.
- **Frontend:** the reached banner (two-way fork) on `/today`; the "Maintaining"
  card replacing Goal-Progress in Maintenance Mode; the persistent maintenance
  status + "Start a goal" CTA on `/profile`; the client inferring Maintenance Mode
  from a 404 on `GET /api/goal`.
- **Scope held narrow:** no defended target weight / guard band; the recompute
  trigger covers every Goal lifecycle change — switch, create, and replace
  ([#61](https://github.com/skrymer/tucker/issues/61), shipped with F7); no cause
  attribution and no lift/training proxy. Intentional weight gain (a **surplus
  goal**) is the
  symmetric future feature, filed as
  [#62](https://github.com/skrymer/tucker/issues/62) — until it exists, a
  deliberate bulk reads as drifting up.

## References

- [0002 — business logic belongs in the backend](0002-business-logic-belongs-in-the-backend.md)
  — the Weekly Review is the single source of truth for the Budget; the
  recompute-on-lifecycle-change trigger lives there, not in the UI.
- [`CONTEXT.md`](../../CONTEXT.md) — `Maintenance Mode`, the **reached** Goal,
  `Drift Status`, `Calorie Budget`, `Protein Floor`.
- [#61](https://github.com/skrymer/tucker/issues/61) — recompute today's review on
  Goal create/replace.
- [#62](https://github.com/skrymer/tucker/issues/62) — surplus (gaining) goals.
</content>
</invoke>
