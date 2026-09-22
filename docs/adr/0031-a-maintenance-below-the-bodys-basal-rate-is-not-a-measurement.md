# A Maintenance below the body's basal rate is not a measurement

The adaptive **Maintenance** correction is an energy balance, and nothing bounded
it. A window that logs thinly and gains weight drives the estimate to zero and
past it, where `Maintenance`'s own `require(kcal > 0)` refuses it and takes `GET
/api/summary` down with it. The engine now **refuses its own estimate whenever it
falls below the User's basal metabolic rate**, and holds the prior figure instead
— the line being the one the User's own body draws, not one Tucker picked. Because
a User cannot guess that their logged days were incomplete, a **HELD** figure also
stops being a badge that says nothing: it records *which* condition held it, and
Today says what would unfreeze it.

*Status: accepted; fixes [#332](https://github.com/skrymer/tucker/issues/332) and
[#348](https://github.com/skrymer/tucker/issues/348); extends
[0018](0018-adaptive-maintenance-averages-over-logged-days.md) decision 3 and
**reverses** its [#292](https://github.com/skrymer/tucker/issues/292) amendment's
ruling that a basis does not explain itself; completes the pair
[0030](0030-a-deficit-maintenance-cannot-supply-is-suspended-never-floored.md)
opened and declined to close; honours
[0002](0002-business-logic-belongs-in-the-backend.md),
[0022](0022-a-check-states-cost-and-return-and-never-labels-a-food.md) and
[0029](0029-a-weight-timeline-shows-the-body-and-the-intake-behind-it.md).*

## Context

`Maintenance.adaptive` is one subtraction away from not existing:

```kotlin
val divisorDays = maxOf(trendChange.overDays, windowDays)
val energyFromWeightChange = -trendChange.kg * Goal.KCAL_PER_KG_FAT / divisorDays
Maintenance(kcal = totalIntakeKcal / loggedDays + energyFromWeightChange, ...)
```

The second term is **negative whenever the Trend Weight rose**, and nothing clamps
it. `estimateMaintenance` gates only on there being a trend anchor, both coverage
floors being cleared, and `totalIntake > 0` — none of which bounds the result. So
`Maintenance`'s own `require(kcal > 0)` is reachable through the engine, and the
blast radius is byte-for-byte the one ADR 0030 tabulates: the daily summary 400s
every day the window holds, and `POST /api/goal` and `PUT /api/profile` 400 **and
roll back the User's own change**.

ADR 0030 closed the `IntakeTargets` route to that same 400 and said in writing
that this one stayed open. This ADR closes it.

**It is reached by ordinary data.** Ten logged days at an 800 kcal average, two
readings 13 days apart with the trend up 1.5 kg: the divisor floors at 14, the
energy term is `−1.5 × 7700 ÷ 14 = −825`, and the estimate is **−25 kcal**.

*Since [0032](0032-the-trend-weight-smooths-in-days-and-a-change-read-from-it-is-un-shrunk.md)
that arithmetic is unchanged and **more easily reached**. The figures here are stated in
**trend** movement, and a trend that now reports the real movement rather than a fraction
of it reaches 1.5 kg off a real rise of about 1.5 kg where it used to need roughly 2.3 —
so this refusal fires on a body movement about a third smaller. That is the clamp doing
its job, which is why it had to land first.*

### The invariant is the symptom, and fixing only it would leave the defect

Move that same User's trend rise from 1.5 kg to 0.5 kg and the estimate is **+525
kcal**. It publishes. Nothing refuses it, and the basis badge says `ADAPTIVE` —
the engine measured this. Against a Goal, ADR 0030 then suspends a deficit that
cannot fit inside 525 kcal and the card explains itself; in **Maintenance Mode**
there is no card at all, and a 525 kcal Calorie Budget is presented as an ordinary
week's target for a 50 kg woman whose basal metabolic rate is 1139.

So the defect is not "the estimate can go negative". It is that **the estimate is
unbounded below**, and zero is merely where the exception happened to be thrown.

### What the engine actually has evidence of

ADR 0018 decision 2 gives the intake term a coverage floor, and the #292 amendment
gives the weight term one. Both count **days**: at least 10 of 14 carrying an
Entry, at least 1 carrying a Weight Measurement. Day-count is a proxy for *was this
window logged well enough*, and the proxy has a hole it cannot see through — **ten
days logged breakfast-only clear it perfectly.**

Tucker has no independent witness to what a User ate; the log is the only one, and
it is the one lying. The single exception is the scale, which is not self-reported.
The contradiction between the two is therefore the **only** evidence of incomplete
logging the engine will ever have, and a Maintenance driven implausibly low is what
that contradiction looks like. The engine cannot prevent this state. It can only
refuse to publish from it.

## Decision

1. **A Maintenance below the basal metabolic rate is not a measurement of a body.**
   Total daily energy expenditure is the basal rate multiplied by an activity
   factor of at least 1.2 even for a sedentary person, so a TDEE beneath the
   resting cost of staying alive is not a low figure — it is an impossible one.
   Where the estimate lands there, the window's evidence contradicts itself and no
   figure is published from it.

2. **The line is the User's own basal rate, and that is why it is not invented.**
   `Profile.basalMetabolicRateKcal(trendWeightKg, on)` — Mifflin-St Jeor, at the
   same trend weight and date `Maintenance.seed` already uses. It is derived from
   the User's own body, which is ADR 0022's move for **Pace** (`Floor ÷ Budget`)
   and the reason that threshold is defensible where an invented one is not. It
   also scales: a 95 kg man and a 50 kg woman get different lines, as they must.

   Explicitly **not zero**. Zero is where the arithmetic stops producing a number,
   not where it stops producing a *credible* one, and stopping there would close an
   exception while leaving the 525 kcal week untouched.

3. **Below it, ADR 0018 decision 3 applies unchanged** — hold the prior review's
   Maintenance, and seed only at genuine cold start where there is nothing to hold.
   No new fallback path: the basal-rate refusal joins the condition the two
   coverage floors already gate. The Budget goes on moving with physiology rather
   than with logging diligence, and one honestly logged fortnight re-opens the
   adaptive path.

4. **The domain decides, not the service.** `Maintenance.adaptive` gains the basal
   rate and returns `Maintenance?`, null being *this window produced no usable
   estimate*. The alternative — the service computing the balance's validity beside
   the domain that computes the balance — is decision 1's trap from ADR 0030 one
   level up: two spellings of one rule, of which only one gets the next precondition.
   `WeeklyReviewService` goes on loading, composing and persisting, and divides
   nothing.

5. **`Maintenance`'s `require(kcal > 0)` stays, and becomes unreachable through the
   engine.** ADR 0030 decision 8's move exactly, for the invariant it named and
   left open: a guard that no engine path can trip is what a guard should be.

6. **A `HELD` Maintenance records which condition held it** — a nullable
   `HeldReason` beside the basis, not a fourth `Basis` value. **Maintenance Basis**
   stays the three kinds of derivation the domain has, and `null` says the true
   thing about rows written before this rule: *held, reason not recorded*.

   The pair cannot drift in the direction that matters: `Maintenance.held(kcal,
reason)` is how the engine builds a `HELD`, and the `init` block refuses a
   reason on any other basis. `BorrowedFood`'s move — check the join rather than
   keep two facts in agreement by hand.

   The requirement is deliberately **one-directional**, and the constructor stays
   public because the repository hydrates through it: a `HELD` row *without* a
   reason is exactly what every review written before this rule is, so forbidding
   it would refuse to load production. That is the one shape a reader is likely to
   "tidy up", and it is why the round-trip is asserted on the null side too.

   **Stored, not derived on read.** ADR 0030 decision 5 supplies the discriminator
   and answers it: a **Suspended Deficit** is derived because *"a suspension is a
   condition that resolves itself"*, while *"a basis is a fact about how a figure
   was derived and is true forever."* Why a figure was held is the second kind.

7. **The reason names the observation, never the inference.** `BELOW_BASAL_RATE`,
   beside `THIN_LOG`, `UNWEIGHED_WINDOW` and `NO_WINDOW_ANCHOR`. We suspect the log
   is what is wrong — the scale is not self-reported — but the engine knows only
   that one figure fell under another, and a persisted enum outlives the copy around
   it. ADR 0029's *"it describes; it never infers"*, ADR 0022 refusing to label a
   Food, ADR 0027 naming an unmatched share as unknown rather than as a shortfall.

   **The copy is held to the same rule, which is a correction.** An earlier draft
   licensed the remedy to be helpful "because a sentence can be revised", and the
   sentence it licensed was *"Log your whole day, not just part of it"* — the
   inference, restored one layer up. It is wrong often enough to matter: ADR 0018's
   #292 amendment measures a trend's capture of a real 1.0 kg fall at **0.145** on a
   third-ever reading, so a User who logs every meal and weighs weekly reaches this
   refusal on a Budget they ate exactly, and is told they under-log. Both the remedy
   and the badge qualifier now state the finding — *the log and the scale do not line
   up* — and ask for the one thing that is true either way: keep logging and weighing.

8. **A window with no anchor is its own reason, and it is the common one.**
   `changeSince` returns nothing when no reading predates the window's start, which
   is not a missing weigh-in but a missing *history* — a User weighing daily has it
   until their readings reach back a fortnight. Naming it `UNWEIGHED_WINDOW` told
   somebody who had weighed in seven times to weigh in.

   **It also has to outrank the coverage floors, because these conditions co-occur.**
   Every new User's second review fails the logging floor *and* has no anchor: the
   window cannot hold ten logged days when they have existed for seven. Ordering by
   "what can be acted on soonest" put `THIN_LOG` first and made the very first
   explanation Tucker ever shows both false and impossible to act on. The order is
   therefore the **binding** condition — the one still unmet when the others are met
   — and an anchor leads because it is the only one no action reaches.

9. **The remedy is surfaced on Today, and the ledger badge carries the reason.**
   A badge on `/review` prevents nothing: history does not tell anybody what to do
   today, and the Budget the User is being held to is on `/`. So a line beside the
   Calorie Budget says the Budget is being held and **what would lift it**, and the
   existing basis badge names the **condition**, through the one
   `REVIEW_BASIS_BADGE` map that already feeds both the phone card and the desktop
   table.

   The split is deliberate. Today has one job — tell somebody what to do now — and
   a condition name in front of the remedy ("short history", "thin log") is a label
   for a reader browsing history, not an instruction. The remedies are written to
   carry their own condition where it matters, which is why `BELOW_BASAL_RATE`'s
   states the disagreement rather than simply asking for an action.

   Four reasons, four remedies: **log more of the food you eat**, **weigh in once**,
   **keep weighing — it needs a fortnight of readings**, and **your log and your
   weight do not line up yet**.

10. **A line, not a card.** ADR 0030 earned its card on a specific argument — *the
   one state where a User can be silently not-cutting while believing they are*. A
   held Budget is **stale, not wrong-direction**, and it fires every week a User
   logs 9 of 14 days. A card that permanent stops being a warning and becomes
   furniture.

11. **This reverses ADR 0018's #292 amendment, which declined exactly this**:
    *"Tucker does not say which floor held it: `HELD` stays one value, though the
    remedy differs (weigh once / log more), and a basis that explains itself is a
    surface decision this ADR does not take."* That was defensible with two
    reasons, both of which a User can guess from their own behaviour. The third is
    **unguessable** — they logged ten of fourteen days and weighed in, and by every
    signal available to them they did everything right. A remedy nobody can infer is
    what changed the answer, and ADR 0018 is amended to point here rather than left
    to contradict this silently.

## Considered and rejected

- **Clamp the figure at a floor** — the issue's second candidate. Every floor is a
  number Tucker invents, which is ADR 0030's whole argument against a floored
  Budget and ADR 0022's against a threshold of its own. It is also *pinned* in
  ADR 0024's sense: the adaptive correction can never move a Maintenance sitting on
  a floor, so it is precisely the uncorrectable target that ADR refuses. And it
  hides the contradiction — the User sees a plausible figure derived from evidence
  Tucker has just proved is broken.
- **Bound the weight term rather than the result** — the issue's third candidate,
  and the worst of the three. It produces a figure at or just above zero and stamps
  it `ADAPTIVE`, which tells the User the engine measured it. Laundering a broken
  estimate as a measured one is worse than publishing it honestly.
- **Draw the line at zero** — the smallest fix, and the issue as literally written.
  Closes the 400 and leaves the 525 kcal week, which is the same defect one
  arithmetic step earlier. Zero is where the number stops existing, and this ADR is
  about where it stops being a measurement; those are different lines and only the
  second is about the User's body.
- **A plausibility floor above the basal rate** — some fraction of the seed, or a
  flat minimum. It catches more, and every extra kilocalorie of it is invented,
  which is candidate two arriving as a trigger instead of as a value. The basal rate
  is the largest line available that the User's own body draws.
- **Split `Basis` into `HELD_THIN_LOG` / `HELD_UNWEIGHED` / `HELD_BELOW_BASAL_RATE`**
  — less machinery than a column, and no migration. Rejected because it puts a fourth
  value into a concept `CONTEXT.md` defines as three kinds of *derivation*, and the
  legacy `HELD` then rides the badge map forever as a value only history uses. A
  nullable reason says the same thing in the shape the domain actually has, and
  `null` is the honest spelling of *we did not record it*.
- **Derive the held reason on read** rather than storing it — the **Suspended
  Deficit** treatment. Rejected by that ADR's own discriminator: a suspension
  resolves itself, a derivation is true forever. Re-deriving would also mean
  re-reading a window that has since moved, so an old review's badge would change
  its story.
- **Backfill the reason onto existing `HELD` rows** — they were computed under a
  rule that did not record one, and the window they were computed from is gone.
  ADR 0018's own stance: *"past reviews remain honest history under the old rule."*
- **A card on Today**, matching ADR 0030's suspension treatment — decision 10.
- **Splitting `BELOW_BASAL_RATE` out to a louder treatment than the rest** —
  arguable, since that User's whole Today screen is a fiction and not just their
  Budget. It is a second design decision and would ship reasons that read
  different ways; left for evidence that the quiet line is insufficient.

## Consequences

- **The net is far wider than the invariant it was opened for, and deliberately.**
  The refusal does not need a trend *rise* at all. For the 50 kg woman above, at an
  800 kcal logged average against a 1139 kcal basal rate, the adaptive path opens
  only if the trend **fell by more than 0.62 kg** across the window. That is the
  correct reading: eating 800 kcal a day and not losing weight is not a thing that
  happens, so the log is wrong.
- **A chronic under-logger holds forever**, on the seed at cold start. That is ADR
  0018 decision 3's contract rather than a regression of it — *the engine would
  rather be a week stale than confidently wrong* — and the alternative it replaces
  is telling somebody their maintenance is 525 kcal. It is also now **visible**,
  which it was not: decision 8 is what makes a permanent hold something the User can
  act on instead of something that merely happens to them.
- **A true value is almost never refused.** For TDEE to fall below an *estimated*
  basal rate, Mifflin-St Jeor would have to over-predict by more than 17% **and**
  the User be essentially without activity — the formula is within 10% for most
  people, and the sedentary factor alone is 1.2. The floor tests for impossibility,
  not for unusualness.
- **It narrows how a Suspended Deficit is reached, and ADR 0030 is unaffected in
  substance.** That state needs a Maintenance too small to carry its Goal's deficit,
  and the obvious way to drive one — a fortnight logged at 800 kcal against a flat
  trend — is now refused, because for the 70 kg body in question the basal rate is
  1339 and eating 800 while holding steady is the contradiction this ADR exists to
  catch. Suspension is still reached by the engine correcting Maintenance *down*;
  what changed is that the intake it corrects from has to be one a body could
  actually run on. The window between a basal rate and a steep Goal's deficit is
  where the state now lives, and it is not narrow: at 1339 against a 1.5 kg/week
  deficit of 1650, anything in between suspends. `suspended-deficit.smoke.spec.ts`
  was driving the impossible half and now drives the credible one.
- **A migration**: `weekly_review` gains a nullable `held_reason`. No `REFERENCES`,
  so no rebuild (V14's precedent), and nothing is backfilled.
- **`Maintenance.adaptive` becomes nullable at the call site**, and that is the
  smaller half of what `estimateMaintenance` owes. It also splits its single
  coverage flag into the three the reasons are read from, and grows a `holdReason`
  classifier — because a hold that has to name its cause cannot collapse those
  conditions first. Callers in tests that assert the adaptive figure now assert a
  non-null one, which is the signature saying what decision 1 says.
- **The basis badge still cannot explain a `FORMULA_SEED` after a Calorie-Tracking
  stretch** (ADR 0024) — that is a seed, not a hold, and carries no reason. Out of
  scope here; nobody has reported being confused by it.
- **#306 lands on the same screen.** A `HELD` review cannot move the Budget while
  its **Protein Floor** re-derives from the trend, which is exactly the sub-rounding
  payload that made the budget-change banner announce a change the User could not
  see. After this batch that week produces no banner, and the Today line explains
  the frozen Budget instead — the two fixes are complementary rather than
  overlapping.
- **Since shipped**: [#293](https://github.com/skrymer/tucker/issues/293)
  ([ADR 0032](0032-the-trend-weight-smooths-in-days-and-a-change-read-from-it-is-un-shrunk.md)),
  which stops the EWMA compressing trend deltas and so makes a real rise come out
  larger. It moves how often this refusal fires; it does not change what it does,
  and #332 shipping first is what keeps that true — see the note under *It is
  reached by ordinary data* for the figures.

## References

- [#332](https://github.com/skrymer/tucker/issues/332) — the invariant this closes;
  [#348](https://github.com/skrymer/tucker/issues/348) — the badge that explains itself.
- [0018 — adaptive Maintenance averages over the days actually logged](0018-adaptive-maintenance-averages-over-logged-days.md)
  — decision 3 (hold when it cannot adapt), extended; the #292 amendment's ruling on
  a self-explaining basis, reversed.
- [0030 — a deficit Maintenance cannot supply is suspended, never floored](0030-a-deficit-maintenance-cannot-supply-is-suspended-never-floored.md)
  — the sibling 400 it closed, the invariant it named and left open, and the
  stored-versus-derived discriminator decision 6 reuses.
- [0024 — a Weekly Review carries Intake Targets only when they can be corrected](0024-a-weekly-review-carries-intake-targets-only-when-they-can-be-corrected.md)
  — do not publish a target the correction can never reach.
- [0022 — a Check states cost and return, and never labels a Food](0022-a-check-states-cost-and-return-and-never-labels-a-food.md)
  — deriving a threshold from the User's own figures rather than inventing one.
- [`CONTEXT.md`](../../CONTEXT.md) — `Maintenance`, `Maintenance Basis`,
  `Weekly Review`, `Intake Targets`.
