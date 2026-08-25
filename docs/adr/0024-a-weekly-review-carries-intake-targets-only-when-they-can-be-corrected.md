# A Weekly Review carries Intake Targets only when they can be corrected

A **Weekly Review** has two jobs: it records the **Trend Weight**, always, and —
only with **Calorie Tracking** on — it also derives that week's **Intake
Targets**, one nullable value object holding the **Maintenance** (with its
basis), the **Calorie Budget** and the **Protein Floor**. With tracking off there
are none: the Budget is **absent**, not zero and not stale. Toggling the setting
force-recomputes today's review in both directions, and turning it *on* after a
weight-only stretch **seeds** rather than holds.

*Status: accepted; narrows [0008](0008-maintenance-mode-is-the-absence-of-a-goal.md)'s
"the Protein Floor still applies" (decision 8); extends the adaptive engine of
[0018](0018-adaptive-maintenance-averages-over-logged-days.md), reuses the
recompute trigger of [0008](0008-maintenance-mode-is-the-absence-of-a-goal.md),
honours [0002](0002-business-logic-belongs-in-the-backend.md),
[0014](0014-client-owns-today.md) and [0023](0023-absence-on-the-wire-is-an-explicit-null.md).*

## Context

F12 ([#246](https://github.com/skrymer/tucker/issues/246)) made Calorie Tracking
a setting a User owns, and slice 2 hid the log half of the app from a User who
turns it off. Underneath, nothing changed: the engine still derived a Calorie
Budget and a Protein Floor for that User every week, and the client was all that
kept them off the screen.

That Budget is **uncorrectable by construction**. The adaptive correction needs
10 logged days in 14 (ADR 0018); a User who logs nothing never reaches the floor,
so the first review seeds from Mifflin-St Jeor and every review after it is
`HELD` at that seed. The figure never moves toward the truth, because the only
thing that could move it is the intake this User has declared they will not
record. ADR 0018's principle — do not adapt from data you do not trust — extends
to: **do not publish a target you can never correct.**

Leaving it derived-but-hidden is not free either. It is a real number on the
wire, so `GET /api/summary` states a Budget for somebody the app shows none to,
`GET /api/check/{barcode}` will happily state shares of it, and the review ledger
renders months of figures that were never anybody's plan. Every one of those is a
place the two halves of the app can disagree.

## Decision

1. **`WeeklyReview` gains `intakeTargets: IntakeTargets?`** — one nullable value
   object holding `maintenance` (kcal + basis), `calorieBudgetKcal` and
   `proteinFloorG`, and the `require(> 0)` invariants move *inside* it intact.
   Not four nullable fields. Four independent nullables admit states the domain
   does not have — a Floor with no Budget, a Budget with no basis — and force
   every consumer to re-establish that they agree. One object keeps the
   invariants strict for the tracking User rather than relaxing them for
   everyone in order to describe a User the engine had no work for, and it nests
   on the wire, so one branch in the ledger unlocks four columns instead of four
   null checks that can drift apart.

2. **Absent, not zero.** Nothing downstream reads a zero Budget as "no budget":
   the day verdict would read as over budget on the first Entry, and `Check.of`
   divides by both figures. Absence has exactly one spelling.

3. **The cadence is untouched.** Reviews still fire weekly by lazy catch-up, the
   manual trigger still works, and a review run with tracking off is a normal
   review with a Trend Weight in it. There is one engine, not two.

4. **Toggling Calorie Tracking is a fourth review trigger**, alongside the weekly
   catch-up, the manual run and a Goal lifecycle change. It reuses
   `WeeklyReviewService.recomputeFor(today)` — delete today's record, re-run —
   in **both** directions, for the reason ADR 0008 gives for the third: reviews
   are held steady between cadence ticks, so without it turning tracking on
   leaves a User with a Log-entry button and no Budget for up to a week, and
   turning it off leaves a stale Budget on `/` for just as long. `PUT
   /api/profile` therefore carries `clientToday`, exactly as `POST`/`DELETE
   /api/goal` do (ADR 0014). Only on an actual change of the setting, and only
   once setup is complete: a first Profile turns nothing on or off, and a
   recompute with no Weight Measurement has no Trend Weight to run against.

5. **Turning Calorie Tracking on after a weight-only *stretch* is a cold start.**
   `estimateMaintenance` holds the prior review's Maintenance when it cannot
   adapt; after a stretch that review has no targets to hold, so it seeds from the
   formula against the current Trend Weight instead.

   A **toggle is not a stretch**, and the rule has to tell them apart, because
   decision 4 makes reviews neither weekly nor contiguous: a toggle writes one
   whenever it fires. So "the immediately preceding review carries no targets" is
   *not* on its own "tracking was off last week" — flip the setting off on Tuesday
   and back on Wednesday and it holds too. The rule is therefore: hold the
   preceding review's figure; failing that, hold the most recent review that does
   carry targets, **provided the gap itself is under one cadence**
   (`ReviewCadence.REVIEW_CADENCE_DAYS`) — measured from the *preceding* review's
   date, which is when tracking went off, not from the held figure's own age.

   The distinction is not academic. Measuring the figure's age instead would
   re-seed a User who had simply been **away**: a fortnight's absence, one app open
   that mints a fresh targets review, tracking off and on again the next day — and
   the only targets-carrying review left to hold would be the fortnight-old one,
   which the toggle-off had not destroyed but the age bound would reject. Absence
   is ADR 0018's case and holds unconditionally; the length of the *tracking* gap
   is the only thing this bound is about.

   This is a deliberate, narrow deviation from ADR 0018, whose rejection of
   seeding was aimed at the **lapsed logger**: there, reverting to the seed makes
   the Budget yo-yo with logging diligence rather than physiology. A weight-only
   stretch is not sparse logging. It is a User who *declared* they were not
   logging, and the alternative is worse: the held figure was computed for a body
   that may be many kilos away, so it would be neither the truth nor a stable
   habit. The seed re-anchors on the body they have now, and adapts away within
   two weeks either way.

6. **`DailySummaryResponse` gains `setupComplete`**, promoted from the predicate
   the engine and `ReminderPolicy` already use (a Profile *and* at least one
   Weight Measurement). It is needed because after this change `calorieBudget ==
   null` means two different things — setup unfinished, or not tracking — and the
   client must give them opposite messages, the same trap **Inconclusive Lookup**
   exists to name. Setup completeness is **orthogonal** to tracking: a weight-only
   User with no reading genuinely is not set up, and one who has weighed in is
   finished even though they will never see a Budget.

7. **The Review ledger picks its columns from the data, not the setting.** Budget
   / Maintenance / Basis / Floor render whenever *any* review in the history
   carries targets, and rows without them are em-dashed. Choosing from the
   current setting is wrong both ways: it erases a currently-off User's real
   history, and gives a currently-on User four columns of em-dashes over their
   weight-only stretch. Deltas fall out of the same rule — the Trend Weight delta
   spans a gap, because the trend is continuous, while a targets delta needs both
   neighbours to carry targets, because a Budget that was never published cannot
   have moved.

8. **The Protein Floor goes with the Budget**, which narrows ADR 0008's "the
   Protein Floor still applies" — that ADR's concern is the *Goal* axis, and the
   decoupling it made is untouched: the Floor is still `2 g/kg × Trend Weight` with
   no reference to a Goal, and still applies in Maintenance Mode. What is new is a
   second way for it to be absent, and it is not decision 2's reason: the Floor is
   derived from the trend, which a weight-only User goes on producing, so it is not
   uncorrectable. It goes because a daily protein minimum is no use to somebody who
   is not weighing what they eat, and because splitting it out would reintroduce
   exactly the Floor-without-a-Budget state decision 1 exists to forbid.

9. **`weekly_review` is rebuilt (V15)** to relax the four columns to nullable,
   under a table-level CHECK that holds them to all-or-none. Nothing references
   `weekly_review` — it only points at `user` — so by ADR 0021's rule this is the
   ordinary in-transaction rebuild: foreign keys enforced throughout, no
   `executeInTransaction=false` and no `PRAGMA foreign_keys = OFF`. No row is
   rewritten: every review written before this was written by an engine that
   always produced targets.

## Considered and rejected

- **Keep deriving the Budget and let the client hide it** — the status quo after
  slice 2. It leaves a number the User can never act on live on the wire, so the
  API, a Check and the ledger all disagree with the screen, and each is a place
  the disagreement can surface as a wrong figure rather than an absence.
- **Four nullable fields on `WeeklyReview`** — see decision 1. It is the same
  data with the invariants deleted.
- **A zero Budget as the "off" value** — collides with a real zero nowhere,
  because a real zero is already refused; but it silently becomes a *target* to
  every consumer that only checks for null, which is all of them.
- **Gate the review itself on Calorie Tracking** — a weight-only User would lose
  the dated Trend Weight record, which is precisely the half of the app they came
  for, and the reminder's overdue predicate would have nothing to be overdue
  against.
- **Wait for the next weekly cadence after a toggle** — up to seven days of a
  Log-entry button with no Budget, or of a stale Budget on `/`. ADR 0008 already
  rejected this shape of delay for a Goal change.
- **Hold the pre-gap Maintenance whenever tracking comes back on**, however long
  the gap — the letter of ADR 0018, and wrong here: the figure was computed for a
  body that may be many kilos away, so it would be neither the truth nor a stable
  habit. Bounded to one cadence instead (decision 5).
- **Treat any target-less preceding review as a cold start**, with no bound — the
  first shape of decision 5, and it makes a setting flipped for a single day cost
  a sparse logger several hundred kcal of Budget, which is exactly the yo-yo
  ADR 0018 exists to prevent, just triggered by a switch rather than by logging.
- **Guard `POST /api/entries/*` against a non-tracking User** — the UI is the
  gate. A stray Entry from a hand-rolled request is harmless and honest (they ate
  it), and refusing would invent an error state no client walks.

## Consequences

- `WeeklyReviewRepository` gains `latestWithTargetsBefore`, which differs from
  `latestBefore` only across a Calorie-Tracking gap — the one place the engine has
  to tell a toggle from a stretch.
- `IntakeTargets` is a new domain type, and `WeeklyReview` loses three fields to
  it. Every consumer that read a Budget off a review now branches once: the
  summary, the Budget Projection preview, `CheckService`, `BudgetChange.between`,
  and the ledger.
- **`GET /api/check/{barcode}` answers 409 for a review with no targets**, the
  same status it already gave before setup produced one. A Check is undefined
  without a Budget by ADR 0022's own rule, and `/check` is out of a weight-only
  User's navigation, so this is reached only by an old link — which the tab's own
  "Calorie tracking is off" state explains.
- **`WeeklyReviewResponse` nests `intakeTargets`**, a breaking shape change for
  the ledger's client code. The spec and the generated client are regenerated in
  the same change; `OpenApiSnapshotTest` fails until they are.
- **`BudgetChange` is null across a gap.** The banner announces a Budget that
  *moved*; the first review after a weight-only stretch has nothing to have moved
  from, so it announces nothing rather than a jump out of nowhere.
- **The Weekly-Review Reminder's copy is now wrong for half its audience** — it
  says "log today and refresh your calorie budget" to a User with neither.
  Deliberately out of scope here and owned by
  [#250](https://github.com/skrymer/tucker/issues/250); the firing *rule* needs
  no change, because a review still comes due either way.
- `MaintainingTile`'s drift copy stops promising a budget adjustment to a User
  who has no budget, for the same reason: the two drifting states closed on the
  Budget self-correcting, which is a promise only a tracking User's app can keep.
- The V15 CHECK makes the value object's atomicity a database fact, so a
  hand-written row cannot introduce a half-populated shape every reader would
  then have to tolerate. It also cost `maintenance_basis` its V7 `DEFAULT
  'FORMULA_SEED'`, which would otherwise give an omitting INSERT a basis and
  nothing to be the basis of.

## References

- [#249](https://github.com/skrymer/tucker/issues/249) — the slice this records;
  [#246](https://github.com/skrymer/tucker/issues/246) — the parent PRD.
- [0018 — adaptive Maintenance averages over logged days](0018-adaptive-maintenance-averages-over-logged-days.md)
  — the coverage floor that makes a non-tracking User's Budget uncorrectable, and
  the hold rule this narrows.
- [0008 — Maintenance Mode is the absence of an active Goal](0008-maintenance-mode-is-the-absence-of-a-goal.md)
  — the force-recompute trigger reused here.
- [0014 — the client owns "today"](0014-client-owns-today.md) — why `PUT
  /api/profile` carries `clientToday`.
- [0021 — every row is owned by one User](0021-every-row-is-owned-by-one-user.md)
  — the rule that prices the V15 rebuild.
- [0023 — absence on the wire is an explicit null](0023-absence-on-the-wire-is-an-explicit-null.md)
  — how `intakeTargets: null` reaches the client.
- [`CONTEXT.md`](../../CONTEXT.md) — `Intake Targets`, `Weekly Review`, `Calorie
  Tracking`, `Calorie Budget`, `Protein Floor`.
