# A Weight Timeline shows the body, and the intake behind it

A **Weight Timeline** states what a **User**'s weight did over the trailing 28 or
90 days — every **Weight Measurement** in the window, drawn as points beneath the
**Trend Weight** line through them — and, with **Calorie Tracking** on, what they
were eating while it did. Weight is the premise and intake the addition, so the
section is **not gated on Calorie Tracking** the way the **Intake Breakdown** and
the **Micronutrient Intake** are: it degrades rather than disappearing.

_Status: accepted; honours [0002](0002-business-logic-belongs-in-the-backend.md),
[0016](0016-goal-start-weight-is-the-trend-weight.md),
[0018](0018-adaptive-maintenance-averages-over-logged-days.md) and
[0023](0023-absence-on-the-wire-is-an-explicit-null.md); narrows nothing in
[0008](0008-maintenance-mode-is-the-absence-of-a-goal.md), whose out-of-scope
ruling it relies on. The domain term lives in [`CONTEXT.md`](../../CONTEXT.md)._

## Context

Tucker could state a weight and a trend as **numbers** — the Today tile, the
**Goal Progress** hero, the **Weekly Review** ledger — and could draw neither over
time. The one question every diet tracker exists to answer, "is what I am doing
working?", had no picture.

The obvious shape is weight and calories on one time axis, and the obvious trap
sits immediately behind it: Tucker **already computes** the relationship between
the two. That is what **Maintenance** is — the average daily intake over the days
actually logged, plus the energy equivalent of the Trend Weight's change
(ADR 0018). Any chart that *infers* a relationship produces a second, independent
answer to a question the adaptive engine already answers, and the two then have to
be kept in agreement by hand.

## Decision

**It describes; it never infers.** Two series on one time axis, and the eye makes
the link. A scatter of weekly intake against weekly trend change would be the
honest inferential version — its fitted line's x-intercept *is* Maintenance — and
it is rejected precisely because it would be honest enough to disagree with the
Budget on screen. "What do I maintain on" has an owner already.

**The raw readings are shown, and never read against.** Goal Progress and the
adaptive correction run on the Trend Weight, "never on a single raw measurement",
and that is a rule about *computation*; `/profile`'s weight list has always
displayed the readings themselves. Drawing them as **points** rather than a second
line is what keeps the distinction visible: two lines read as two comparable
trends, and the noisy one then looks like a legitimate alternative reading.
Scattered points beneath a gliding line read as *measurements, and the line
through them*, which is the actual relationship — and is the only defence the
chart has against a User reading Tuesday's intake spike as Wednesday's weight
gain, which putting calories on the same axis actively invites.

**Whether a day went over its Budget is the backend's verdict**, on the same
unrounded comparison a day's own **Day Status** already makes, rather than a
comparison the chart repeats — two answers to one question would sooner or later
colour a bar green that Today calls over budget (ADR 0002).

**An unlogged day is absent, never zero.** A missing bar and a floor-height bar
are the same picture, and "you ate nothing" is the reading ADR 0018 exists to
refuse — the engine averages over logged days so a gap cannot drag Maintenance
down. So an unlogged day carries an explicit `null` (ADR 0023) and draws a
baseline tick: something has to distinguish it from a day at the floor. The
**Calorie Budget** line **spans** it, because a Budget is set by a Weekly Review
and holds all week — it applied on that day exactly as on the days either side,
and breaking the line would assert it lapsed because the User stopped recording.

**With Calorie Tracking off the intake half goes, including the days it could
have drawn.** A **Weekly Review** ledger keeps a currently-off User's real history
and picks its columns from the data (ADR 0024); a timeline is a *current-state*
read and picks from the setting, so turning tracking off takes the bars with it
even for the weeks whose reviews carried **Intake Targets**. The two differ
because the ledger is a record of what the engine did and the chart is a picture
of what the User is doing.

**With Calorie Tracking off, the Goal's planned trajectory takes the intake
half's place** — the sloped line from the Goal's start weight (itself the Trend
Weight standing on the Goal's start date, ADR 0016) at its chosen rate. It appears *only* there, and
that asymmetry is the point rather than an oversight: both settings ask "am I on
track?", and with tracking on the **calorie half answers it** — intake under the
Budget line is the mechanism and the falling trend is the confirmation. With
tracking off there is no mechanism to show, so the trajectory is the only thing
that can answer. A tracking User therefore never sees their plan spatially and the
Goal Progress hero above remains their only source; that cost is accepted.

Because they take one another's place, the two are **one value object and never
two nullable parameters**: a timeline carrying both would answer one question
twice, on an axis with room for neither. The domain therefore takes a single
`TimelineEvidence` — a `TimelineIntake` or a `GoalTrajectory`, or nothing at all
in Maintenance Mode — and the controller's choice reads as the sentence above.

**The plan flattens at the target rather than sloping on below it.** The plan is
to reach the target; there is none past it, and a 90-day window over a 56-day plan
would otherwise draw a line the User never set. The state is reachable rather than
hypothetical: reaching *latches* and a reached Goal stays active until the fork on
`/today` resolves it (ADR 0008). A day before the Goal was set carries no plan at
all, the plan not existing yet.

That does make a reached Goal's plan **horizontal at the target** for part of a
90-day window — the shape rejected further down as a target line. It is not the
same claim: what that rejection is about is *distance*, a target five to seven
kilos away flattening the trend to make room for itself. This line is flat
*because the User got there*, and the clamp bounds the axis either way.

**A plan of one day is not drawn at all**, and that is the common case rather than
an edge: a Goal is always started today, so its first window carries exactly one
planned day. A line needs two points, and naming a series in the key that nothing
draws is worse than the plain weight card the User had yesterday. A plan that is
off the chart *all* window is not this case — its marker is a mark.

**A plan that is absent all window is indistinguishable from Maintenance Mode**, and
that is the failure mode to watch: `trajectoryKg` is null on every day and
`loggedDays` is null under a plan too, so the responses match byte for byte — the
plan, its key chip and its readout line all go with nothing saying why.

`Goal.started` closes one way in: it refuses a start date in the *writing* User's
future, measured against ADR 0014's resolved today, so a client legitimately a day
ahead of the server still passes. That bounds an unbounded gap, and it is the whole
of what it does — **it does not close the case the plan actually goes missing in**,
which is a relation between `startedOn` and the window's `to`, not between
`startedOn` and the writer's own today. Tucker's client reads its clock twice on one
submit and `clientToday` is the *later* read, so `startedOn <= clientToday` holds
whatever happens in between; but `to` comes from whichever device is *reading*
(`trailingWindow`), and a Goal set on a phone at UTC+10 in the morning is a day
ahead of a desktop reading in UTC. Two timezones, no broken clock.
ADR 0014's ±1 tolerance bounds it to two days and hydration is deliberately
unguarded, so rows already written keep it. Closing it means a read-side change —
clamping `to`, or saying on the wire that a plan exists but does not reach this
window — and that is its own decision, not this one.

**The trajectory is a per-day series like every other**, not the Goal's start
weight, start date and rate for the client to project from. `startWeight − rate ×
weeks`, floored at the target, is derived state and so the backend's (ADR 0002);
sending the three parameters instead would put that arithmetic in a `.vue` file
and leave the clamp below operating on figures the client had just invented.

**In Maintenance Mode there is no trajectory at all**, because Tucker defends no
target weight — ADR 0008 puts a defended target and guard band out of scope. That
state renders the plain weight chart by decision, not by omission.

**The window is 28 or 90 days and nothing else.** 28 is the default because it is
already the span the observed pace, **Pace Status** and **Drift Status** are
classified over, which makes the chart the *evidence* for a status the User is
shown rather than a second span telling its own story. A seven-day window was
rejected outright: the trend moves a tenth of the way toward each reading, so a
week barely separates it from noise — the chart would show exactly what it exists
to talk the User out of reading.

**Withheld under 14 days of Weight Measurements**, the same threshold and the same
reason as the observed pace it sits beside: a trend built from a handful of
readings understates its own movement, so drawing it invites reading a slope that
is not there. One number, not a second — and it answers two questions, because the
two readings of it are not the same measurement. A drawn trend needs fourteen days
**carrying a reading**, since what is thin is the evidence the line is drawn from;
the observed pace needs the trend to **span** fourteen days, since that span is
what it divides by. They therefore disagree at the edge, in both directions: a
fortnight of daily weighing draws a chart while the pace is still gathering, and a
sparse weigher of two months has a pace and no chart. That is the threshold
meaning the same thing to two different consumers, not two thresholds.

## Considered options

**Gating the section on Calorie Tracking**, matching every other calorie surface,
was the consistent choice and is rejected. A weight-only User has the least
information in Tucker — a Goal hero and a ledger of trend weights — and the weight
half of this chart is complete and correct without a single calorie. Withholding
it would deny them the only chart of their own body in the app because they
declined a feature it does not depend on.

**A rolling seven-day intake average**, symmetric with the trend and the shape
people expect, is rejected for the reason the scatter is: it is a *new derived
figure*, absent from `CONTEXT.md`, that is not what ADR 0018 computes (an average
over logged days in the trailing fourteen, feeding Maintenance) and would sit on
the chart quietly disagreeing with the Maintenance the engine published.

**A horizontal line at the Goal's target weight** was measured against a
prototype and is unusable. A Trend Weight chart exists to resolve one to two
kilograms of movement and a Goal lives five to seven kilograms away; including the
target flattens four weeks of real movement into a straight line across the top of
an otherwise empty card. The planned trajectory pays a smaller version of the same
tax, bounded by the clamp below.

**Two stacked panes sharing one x-axis** were built and rejected. They are the
only shape that *cannot* mislead — a dual-axis chart's apparent correlation is
partly an artifact of where the two zero points sit, and sliding the kilogram axis
makes the lines agree or disagree at will. They were rejected for vertical space,
which on a phone is the scarce thing, and the distortion is accepted knowingly.

**Weekly-averaged bars at 90 days** were rejected so that both windows draw the
same daily bars, keeping the 28 ↔ 90 switch two spans of one feature rather than
two features whose buckets would not align with Weekly Review dates anyway.

## Consequences

**The Budget line does not show when the Budget moved.** A fifty-calorie step is
about two percent of a zero-based calorie axis — two pixels. The line earns its
place by giving every bar a meaning (under or over), which is the weaker of the
two claims it was chosen on. "When did my budget move" remains a Weekly Review
ledger question, and that is where it should stay.

**The planned trajectory's compression is unbounded in one direction**, so the
domain is clamped to at most two kilograms beyond the weight data and the
trajectory is clipped past it, with a marker at the edge — a clipped line saying
nothing reads as a bug. Without the clamp, the further behind plan a User falls
the flatter their own trend draws, which is exactly the User the chart matters
most to. The clamp is a rendering rule and so belongs to the client; the series
stay the backend's.

Two kilograms **per edge**, because the plan can also be far *above* the weights —
a User well ahead of it — and that compresses the trend exactly as much. The day
the plan leaves by is drawn *on* the edge, so the line runs off it rather than
stopping in mid-air, and every day past that is **dropped** rather than laid along
the edge: a flat line at the floor reads as a plan that levelled off, which is the
one thing a plan never does. The marker is the plan's only statement that it
continues, so it is also said in words — the key chip reads *Plan off chart* —
because the chart is `aria-hidden` and a mark on it is nothing on its own.

**The plan is in the readout too**, on every day that carries one and at its own
figure rather than the edge it was clipped at. The chart being `aria-hidden` makes
the visually-hidden day list the plan's only accessible surface, and every other
drawn series — the trend, the readings, the calories, the Budget — is already
there; the plan being the exception would put a series on the card that a screen
reader could not reach at all.

**One endpoint, not a client-side join.** `GET /api/weight-timeline?from=&to=`
returns the per-day series. The rules above are domain rules — absent-not-zero,
the intake half vanishing with the setting, the trajectory appearing only when it
does, the refusal of any span but 28 or 90 days (the move `IntakeBreakdown.of`,
`MicronutrientIntake.of` and `FrequentFoods.rank` already make) — and spread
across a four-way client join they would live in a `.vue` file instead. The client
draws; it does not derive, join or sort.

**The Trend Weight series is always built over the User's whole history and then
sliced**, because the trend at a window's start depends on readings from before
it. A window reaching past the first reading is cut to where the readings start:
empty space before it would claim weight data is missing rather than absent.

**Reading a Weight Timeline does not advance the review cadence** or stamp the
last-seen day. Only `/` and a **Check** do
([#192](https://github.com/skrymer/tucker/issues/192) tracks that being narrow),
and widening it here would change when the **Weekly-Review Reminder** fires as a
side effect of adding a chart.

**`@unovis/vue` becomes a direct dependency.** `/review` already ships unovis —
`vue-chrts`' `DonutChart` is a thin wrapper over `VisDonut` — so every alternative
(Chart.js, uPlot, ECharts) would put a *second* rendering engine on a page that
already has one, and hand-rolled SVG would mean owning axes, crosshair and
accessibility for a chart the installed engine can already draw. Going direct also
bypasses the `vue-chrts` barrel, whose TopoJSON re-exports are where F14's 221 KB
came from. Three costs ride along: the **Calorie Budget** step line is a `line`
with a step curve rather than a `plotline` (which takes one constant value);
unovis themes off `html[data-theme="dark"]`, which Tucker's `html.dark` does not
match; and its `MutationObserver` teardown throws under happy-dom, so the chart is
stubbed in component tests and rendered for real only in the browser layers.
