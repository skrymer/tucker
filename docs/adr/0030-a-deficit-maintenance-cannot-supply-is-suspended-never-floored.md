# A deficit Maintenance cannot supply is suspended, never floored

The **Calorie Budget** is **Maintenance** less the deficit an active **Goal**
implies, and nothing ever said what happens when the subtraction reaches zero.
`IntakeTargets` simply refused, which took `GET /api/summary` — and with it the
app — down for as long as the arithmetic stayed there. Two moments want opposite
answers: a rate that does not fit **at the moment it is chosen** is refused with
a real message, and a Maintenance that has since **drifted** under a Goal already
running **suspends the deficit** instead, publishing Maintenance as the Budget
and saying so. Tucker invents no floor in either direction.

*Status: accepted; fixes [#305](https://github.com/skrymer/tucker/issues/305), the
consequence [0018](0018-adaptive-maintenance-averages-over-logged-days.md) records
in advance and declines to fix; extends
[0024](0024-a-weekly-review-carries-intake-targets-only-when-they-can-be-corrected.md)'s
rule about what a review may publish; follows
[0008](0008-maintenance-mode-is-the-absence-of-a-goal.md) on not switching a User's
mode for them, and departs from its fork; honours
[0002](0002-business-logic-belongs-in-the-backend.md) and
[0022](0022-a-check-states-cost-and-return-and-never-labels-a-food.md).*

## Context

`IntakeTargets` refuses a non-positive Budget:

```kotlin
require(calorieBudgetKcal > 0) { "calorieBudgetKcal must be > 0" }
```

and derives it as `maintenance.kcal - (goal?.dailyDeficitKcal() ?: 0.0)`. So a
User whose Maintenance sits at or below their Goal's daily deficit cannot have a
**Weekly Review** written at all.

**It is an outage, not a wrong number.** `GET /api/summary` runs the lazy
catch-up (ADR 0008) on every read, so Today — and therefore the app — answers
**400** every day the condition lasts, with the message `calorieBudgetKcal must
be > 0`. The remedies are to log more, weigh in or ease the Goal, and nothing
tells the User any of them.

**The blast radius is five endpoints, and two of them roll back the User's own
change.** `runReview` is reached from the summary's catch-up, from the manual
`POST /api/weekly-review`, and from `recomputeFor` in three places:

| Endpoint | Effect |
| --- | --- |
| `GET /api/summary` | 400 — the outage |
| `POST /api/weekly-review` | 400 |
| `POST /api/goal` | 400, and `@Transactional` rolls back — **the Goal is not saved** |
| `PUT /api/profile` (tracking → on) | 400, and the same rollback — **the setting is not saved** |
| `DELETE /api/goal` | safe — Maintenance Mode applies no deficit |

**It is reachable on day one, with no drift at all.** A 50 kg, 160 cm,
40-year-old woman at the maximum 1.5 kg/week: the Mifflin-St Jeor seed is
`(10×50 + 6.25×160 − 5×40 − 161) × 1.4 = 1594.6` kcal, the deficit is
`1.5 × 7700 ÷ 7 = 1650`, and the Budget is **−55.4**. She sets her first Goal,
at a rate the validator lets her pick, and Tucker answers with an invariant
message. No adaptive history, no thin coverage, no [#291](https://github.com/skrymer/tucker/issues/291).

[#291](https://github.com/skrymer/tucker/issues/291) widened it rather than
opening it: dividing the weight term by the span between the two readings it was
measured between lowers Maintenance in the long-span direction, so a User on an
aggressive rate whose logged average is already close to Maintenance can now
cross the invariant where the fixed ÷14 kept them above it.

That day-one case is what splits the problem. A User choosing a rate **right
now** and a User whose Maintenance fell under a Goal set months ago are in
different positions, and every candidate in the issue was a single answer to
both.

## Decision

1. **Two moments, two rules.** The same predicate — *does this Goal's deficit fit
   within this Maintenance?* — produces a refusal at the gate and a suspension
   after it. It lives in **one place**, `IntakeTargets.deficitApplies(maintenance,
   goal)`, called by `IntakeTargets.from` and by the gate in
   `GoalService.createGoal`. Not two copies of `maintenance − deficit <= 0`: that
   is F17 slice 2's trap, where the chart derived `overBudget` itself and
   disagreed with the backend it was drawing.

   The daily summary is deliberately **not** a third caller — see decision 5.

   It sits on `IntakeTargets` rather than on `Goal` because the strictness is not
   its own: the predicate is `<` and not `<=` only because `IntakeTargets.init`
   refuses a Budget of exactly zero. On `Goal` those two would agree by comment —
   loosen the `require` and the predicate is silently wrong with `IntakeTargets`
   still green. `IntakeTargets` is also the only type that already holds both a
   Maintenance and a Calorie Budget, so the predicate, the invariant it protects
   and the derivation it guards are one file.

2. **At the gate, the Goal is refused** — `POST /api/goal`, a 400 like the two
   refusals already beside it in `createGoal` ("log your weight before setting a
   goal", and a target at or above the trend). It is checked against the
   Maintenance the review *would* use, before the insert, so nothing is written
   and rolled back.

   `createGoal` is the only gate: it serves replace as well (it deactivates then
   inserts), and `deactivateActiveGoal` cannot reach the condition.

3. **The refusal states the two figures and suggests no rate.** "At your current
   maintenance of 1595 kcal a day, 1.5 kg a week would leave you nothing to eat.
   Choose a slower rate." The fastest rate that *would* fit is computable —
   `Maintenance × 7 ÷ 7700`, so 1.44 kg/week here — and it leaves a **0.4 kcal**
   Budget. Naming it would make Tucker recommend a figure that is arithmetically
   valid and nutritionally absurd, which is the invented floor arriving through
   the copy instead of the code. The only line Tucker draws is the one where the
   number stops existing; that line is the arithmetic's, not Tucker's.

4. **At the drift, the deficit is suspended and the review is written.** The
   Budget is **Maintenance**, the **Protein Floor** is untouched (`2 g/kg ×
   Trend Weight` has nothing to do with this), and the **Goal stays active**. The
   review's first job — recording the **Trend Weight** — was never in question
   and is no longer lost with its second.

   This is not ADR 0008's silent auto-switch, because nothing is switched: the
   Goal is not deactivated, its progress is still computed, and the suspension
   lifts by itself the week Maintenance recovers.

5. **A Suspended Deficit is a live status, derived on read, never stored.** It is
   a sibling of **Pace Status** and **Drift Status**, computed in
   `SummaryController` from the two things it already holds — whether a Goal is
   active, and the latest review's **Intake Targets**.

   What it asks of those targets is `appliesNoDeficit` — *did the Budget come out
   equal to the Maintenance it was derived from* — and **not** whether the live
   Goal's rate outruns that Maintenance. The two differ whenever the review predates
   a Goal change, and only the first is a fact about figures in the same response:
   it reads what the review recorded, so the boolean and the Budget printed beside
   it structurally cannot contradict each other. A Goal's rate always implies a
   deficit, so with one active, "no deficit applied" can only mean suspension.

   Not a column on `IntakeTargets` beside the
   **Maintenance Basis** it superficially resembles: a basis is a fact about how a
   figure *was derived* and is true forever, while a suspension is a condition
   that resolves itself, and a latched historical claim the live state can
   contradict is worse than no claim.

   It reaches the client as one boolean on `DailySummaryResponse`, and that is
   the **whole** of what the card reads. No second figure is needed: when the
   deficit is suspended, `calorieBudget` **is** Maintenance, and that figure is on
   the card directly below. Naming the Goal's rate would have been a second figure
   off a second endpoint (`/api/goal/progress`), and a failed read of it would then
   silence the card in exactly the state decision 6 says must not be quiet.

6. **Surfaced prominently, not a fork.** Reaching a Goal is a milestone you
   cannot sensibly continue past, which is why ADR 0008 latches it and gives it no
   dismiss. An unsupportable rate is a *condition*, and demanding a decision about
   one that may evaporate in a week is exactly the flapping ADR 0008 latched
   against. So: a card, no blocking, no dismiss, no latch — loud enough that the
   User cannot silently eat at Maintenance believing they are cutting, which is
   the real harm here.

7. **It explains the Budget, not the Goal.** It sits with the calorie figures,
   because "why is my budget suddenly my maintenance?" is the question the User
   will have and the Budget is the figure that visibly moved. The Goal ring is
   untouched — progress toward the target is still real.

   **Goal Progress** goes on stating the *planned* finish date at the Goal's
   chosen rate, which no deficit is currently supporting. That is not a wrong
   figure: the plan is what the User set, not a prediction, and Tucker already
   states it for anybody eating over budget. **Pace Status** is the reading that
   answers "am I actually getting there", and a suspended week makes it `BEHIND`
   or `STALLED` on its own evidence.

8. **The `require(> 0)` invariants stay**, in `IntakeTargets` and in `Check.of`.
   Under this rule neither is reachable through the engine, which is what a guard
   should be; `Check.of`'s own comment already says it exists for a hand-written
   row rather than for anything the engine produces.

   `Maintenance`'s own `require(kcal > 0)` is **not** in that set, and this ADR does
   not close it: `adaptive` subtracts the energy of a rising trend from the intake
   average with nothing clamping it, so the same endpoint can still 400 with the
   same blast radius. That is a question about the engine's energy balance rather
   than about what a Budget does, and is tracked in
   [#332](https://github.com/skrymer/tucker/issues/332). **Closed by
   [ADR 0031](0031-a-maintenance-below-the-bodys-basal-rate-is-not-a-measurement.md)**,
   which puts that invariant in this set too: the engine refuses its own estimate
   below the User's basal metabolic rate, so no engine path reaches the `require`.

9. **A weight-only User is none of this rule's business.** With **Calorie
   Tracking** off a review carries no **Intake Targets** at all (ADR 0024), so
   there is no Budget to run to zero. The gate does not fire for them, and turning
   tracking *on* into a too-steep Goal gets the drift rule rather than a refusal:
   they were not choosing a rate, and refusing the toggle would lock them out of
   tracking over a Goal they set long ago.

## Considered and rejected

- **Floor the Budget at a minimum and record that it was floored** — the issue's
  first candidate. Every floor is a number Tucker invents, which is the objection
  ADR 0022 already raises against a threshold of its own — *"any fixed number
  would be invented"* — and answers by deriving **Pace** from the User's own two
  targets. There is nothing here to derive a floor from. It is also pinned: the
  adaptive correction can never move a Budget sitting on a floor, so it is
  precisely the uncorrectable target ADR 0024 exists to refuse.
  And it *hides* the impossibility — the User sees a plausible figure and goes on
  chasing a rate their body cannot support.
- **Hold the previous review's targets** — the issue's third candidate, and the
  smallest change by a distance. Rejected on two counts. It is **not total**: a
  User who turns Calorie Tracking on into an unsupportable Goal has nothing to
  hold, and neither does one whose first review lands here. And what it holds is
  last week's near-starvation figure, stale with nothing saying so — which is the
  trap ADR 0024 named in the first place.
- **Carry no Intake Targets** — the fourth candidate, and the one with machinery
  already built. Absence has exactly one spelling (ADR 0024 decision 2): it means
  Calorie Tracking is off. A second meaning would need a third discriminator,
  which is the `calorieBudget == null` trap `setupComplete` was added to close. It
  also takes the **Protein Floor** with it, which is derived from the trend and
  perfectly correctable, and it would read to the User as Calorie Tracking
  silently switching itself off.
- **Apply as much deficit as Maintenance can support** — keeps the User losing
  *something* rather than nothing. It needs a positive Budget to subtract down to,
  so it is the floor candidate wearing a different hat, with the same invented
  number.
- **One rule for both moments** — whatever happens at the drift happens at the
  gate. It means either taking the app down at the gate (the status quo) or
  accepting a Goal Tucker already knows cannot be pursued and immediately telling
  the User so. The second is a worse interaction than refusing a submit while the
  User still has the rate control in their hand, and it leaves an active Goal that
  does nothing.
- **An insistent two-way fork**, ADR 0008's treatment of the reached Goal —
  "Ease the rate" or "Switch to maintenance", unresolvable by ignoring. It
  guarantees the User acts, and it demands a decision about a condition that
  resolves itself, flapping as Maintenance crosses back and forth. Latching it to
  stop the flap would then be wrong the moment it resolved, which is the mirror of
  why reaching *does* latch.
- **Fold it into existing copy with no new surface** — the smallest UI. This is
  the one state where a User can be silently not-cutting while believing they are,
  so quiet is the one thing it must not be.

## Consequences

- **The Budget goes up the week the Goal becomes impossible**, which reads
  backwards and is the truth: the deficit was never deliverable, and Maintenance
  is the only figure the engine derived. `BudgetChange` fires on that week — a
  jump from a near-zero figure to Maintenance — so the banner announces it, which
  is exactly what that banner is for — no new rule, just `BudgetChange.between`'s
  existing one meeting a Budget that moved a long way.
- **Pace eases**, because **Pace** is `Floor ÷ Budget × 100` and the Budget rose.
  Same direction as **Maintenance Mode**, same reason, and `GET
  /api/check/{barcode}` goes on working rather than 409ing on an absent Budget.
- **The review ledger cannot tell a suspended week from a Maintenance Mode week**
   — both render Budget equal to Maintenance, and the ledger does not show the
  Goal. That is the price of decision 5, and it is an omission rather than a lie:
  both weeks genuinely had a Budget equal to Maintenance. The ledger already does
  not distinguish "Maintenance Mode because I reached my goal" from "because I
  never set one".
- **`POST /api/goal` gains a refusal a client has to render**, as a field-level
  message on the rate rather than a generic toast — it is a validation the User can
  act on in one tap. That took a mechanism the API did not have: `ApiError` was
  `{ message }` and `useApiMutation` routed *every* 400 to the one field a form
  nominated, which for this form is the target weight. A rate refusal rendered
  under "Target weight (kg)" is worse than a toast, and the message alone cannot
  say otherwise.

  So `ApiError` gains a nullable `field`, set by a new
  `InvalidFieldException(field, message)` — an `IllegalArgumentException`, because
  that is what it is: one family for caller error, so nothing already handling the
  general case changes behaviour, and only the more specific handler puts the field
  on the wire. **Both refusals `GoalService` raises** name their field, so the form
  routes on what the backend said rather than on "everything unlabelled is about
  the target". `Goal`'s own `init` refuses a rate outside 0.05–1.5 and does *not*
  name one, so the mechanism is deliberately not total: `InvalidFieldException` is
  an API type and the domain does not depend on the API. That refusal is
  unreachable through the form, whose Zod schema carries the same two bounds
  (ADR 0003), and a direct POST gets it above the submit like any other unnamed one.
  Rejected: sniffing the message for the word "rate" (fragile, and breaks silently
  when copy moves); giving the rate refusal a different status (422 says *never*
  processable, and this becomes processable the week Maintenance rises); validating
  the rate in Zod against a Maintenance handed to the form, which is the pattern the
  target rule already uses but would put a rule about Maintenance in Vue for more
  than ADR 0002's preview carve-out; and one form-level error for both, which is a
  downgrade for the target refusal that lands on its own field today.

  **An unnamed 400 is not field-attributable, and stops pretending to be.**
  `POST /api/goal` also refuses a skewed `clientToday` (ADR 0014) and a User with
  no weight logged — neither about an input — and the pre-existing handler put
  *every* 400 under the target-weight field, so a clock-skewed phone read
  "clientToday … is implausible" beneath a target the User got right. Those now
  render above the submit instead. The alternative — routing only *named* 400s to
  `onValidationError` and letting the rest take the retry toast — is cleaner in
  the abstract and wrong here: `/foods` handles its own unnamed 400 with a
  deliberate no-Retry toast, and would lose it.
- **`Goal` gains nothing**, deliberately. An earlier shape put the predicate there
  as `deficitFitsWithin(maintenanceKcal: Double)`, on the argument that a `Double`
  keeps the aggregate free of the engine. It does not pay: `Maintenance` already
  depends on `Goal` (`Maintenance.adaptive` uses `Goal.KCAL_PER_KG_FAT`), so that
  placement adds a net-new reverse edge and makes the two mutually aware, for a
  rule whose strictness `Goal` cannot see.
- **`WeeklyReviewService.runReview` derives its Maintenance *through*
  `maintenanceFor`**, rather than beside it. Two spellings of "what Maintenance
  would a review for this day derive" is decision 1's trap one level up: a
  precondition added to one and not the other fails *open*, and the symptom is a
  Goal accepted at the gate and suspended the same instant.
- **`GoalService` needs the Maintenance the review would use**, before the review
  runs and therefore before the Goal exists. `WeeklyReviewService` exposes the
  estimate it already computes privately; it references no Goal (ADR 0008 —
  "the adaptive engine never references the deficit or the Goal"), so there is no
  circularity to resolve.
- **ADR 0018's open consequence is closed**, and its framing was right: the fix
  was a policy about what a Budget does when the arithmetic runs it to zero, and
  it is a decision of its own rather than part of correcting a divisor.
- Still open and untouched: [#292](https://github.com/skrymer/tucker/issues/292)
  (the weight-coverage floor) and [#293](https://github.com/skrymer/tucker/issues/293)
  (re-anchoring the EWMA). Neither moves this exposure — #292's thinly-weighed case
  produces a Maintenance that is too *high*.

## References

- [#305](https://github.com/skrymer/tucker/issues/305) — the issue this records;
  [#291](https://github.com/skrymer/tucker/issues/291) — what widened the exposure.
- [0018 — adaptive Maintenance averages over logged days](0018-adaptive-maintenance-averages-over-logged-days.md)
  — "A consequence the floor does not cover, and is not fixed here", which is this.
- [0024 — a Weekly Review carries Intake Targets only when they can be corrected](0024-a-weekly-review-carries-intake-targets-only-when-they-can-be-corrected.md)
  — absence has one spelling, and do not publish a target you can never correct.
- [0008 — Maintenance Mode is the absence of an active Goal](0008-maintenance-mode-is-the-absence-of-a-goal.md)
  — the fork this deliberately does not use, and the lazy catch-up that makes the
  refusal an outage.
- [0022 — a Check states cost and return, and never labels a Food](0022-a-check-states-cost-and-return-and-never-labels-a-food.md)
  — the no-good-or-bad rule that refuses an invented calorie floor.
- [`CONTEXT.md`](../../CONTEXT.md) — `Suspended Deficit`, `Calorie Budget`,
  `Maintenance`, `Goal`, `Pace`.
