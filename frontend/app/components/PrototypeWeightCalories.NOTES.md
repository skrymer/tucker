# PROTOTYPE — the weight-vs-calories chart (throwaway)

Mounted on the real `/review` (dev only), above the Intake Breakdown.
`/review?variant=A|B|C|D|E` · cycle with the top bar or ← / →.
**Judge at 412px first.** Delete this file, `PrototypeWeightCalories.vue`, and the
two marked blocks in `pages/review.vue` once answered.

Held constant throughout, settled in the grill before round 1:

- x is time; window switches **28 ↔ 90** days (28 default — the span Pace Status
  and Drift Status are already classified over)
- the weight side draws **both** raw **Weight Measurements** and the **Trend
  Weight**
- a daily weigher is assumed

---

## Round 1 — what does the calorie side draw? ✅ ANSWERED

Weight is noisy, so it gets smoothed. **Daily intake is just as noisy**, and if it
gets no companion the chart teaches half a lesson: weight spikes are noise, intake
spikes are real. Variants were: bars alone / bars + **Calorie Budget** step line /
bars + rolling 7-day mean / weekly-averaged bars / two stacked panes.

**Verdict: bars + the Calorie Budget as a step line, on one dual-axis chart.**
Over-budget bars in error red, the `DayRing` and `DESIGN.md` convention.

What that settles by elimination:

- **A rolling intake mean is refused**, and not on looks: it is a new derived
  figure, absent from `CONTEXT.md`, that would sit on the chart quietly
  disagreeing with the **Maintenance** the engine publishes (ADR 0018).
- **Stacked panes are refused**, so the chart is dual-axis and carries that axis's
  known weakness — apparent correlation is partly an artifact of where the two
  zero points sit. Accepted deliberately, bought with the vertical space stacked
  panes cost on a phone.
- **Weekly bars are refused**, so both windows draw the same daily bars and the
  28 ↔ 90 switch stays two spans of one feature rather than two features.

### Constraint this leaves behind

**The Budget line does not legibly show when the Budget moved.** The stub steps
1900 → 1850 → 1800, and on a zero-based calorie axis a 50 kcal move is ~2% of the
plot height — about two pixels. The line earns its place by giving every bar a
meaning (under / over), which is the weaker of the two claims it was chosen on.
"When did my budget move" stays a **Weekly Review** ledger question.

---

## Round 2 — what does an UNLOGGED DAY draw? ← current question

A missing bar and a zero bar are the same picture when the baseline is at zero.
"You ate nothing" is exactly the reading ADR 0018 refuses — the engine averages
over the days actually **logged** so that a gap cannot drag **Maintenance** down —
so a chart that renders a gap as floor-level contradicts the engine on the same
screen.

|       | Unlogged day is                | Budget line over it |
| ----- | ------------------------------ | ------------------- |
| **A** | nothing (status quo)           | spans the gap       |
| **B** | nothing                        | **broken**          |
| **C** | a baseline tick                | spans the gap       |
| **D** | a baseline tick                | **broken**          |
| **E** | a hatched bar to Budget height | spans the gap       |

Stub data reshaped for this: the unlogged days are now scattered singles **plus a
three-day stretch inside the 28-day window** (a weekend away) and a two-day one
outside it. A treatment that survives one missed Tuesday and falls apart over a
long weekend has answered nothing. 23 of 28 days logged at the default window.

### What to look for

- **Does a tick read as "no entry", or as "a very small day"?** It sits on the
  baseline, which is where a ~0 kcal bar would also be.
- **Does breaking the Budget line help, or does it fragment the chart?** At 28
  days it currently splits the line into three runs, which reads a little like
  three charts side by side.
- **E was predicted to fail and appears to**: the hatched bars stand taller than
  most real bars, so the days you did not log dominate a chart about the days you
  did. Confirm or overturn that by eye.
- **Is the hover readout ("not logged") enough on its own**, making A or B
  sufficient and every mark redundant?
- **Does the "23 of 28 days logged" caption do the work instead?** It is the move
  the **Intake Breakdown** caption and the micronutrient card already make, and if
  it suffices the chart itself can stay silent.

---

---

## Round 3 — what does a weight-only user get? ← current question

**Calorie Tracking off** (F12 / ADR 0024). Gate the section off like the Intake
Breakdown and the Micronutrient Intake do — or degrade to the weight half, which
is complete and correct on its own and would be the only chart of their own body
anywhere in Tucker?

Header carries two new toggles: `tracking on/off` (on = the settled rounds 1–2
chart, for direct comparison) and `goal / maintenance`.

|       | Weight-only section is                                                |
| ----- | --------------------------------------------------------------------- |
| **A** | not rendered — gated off, consistent with every other calorie surface |
| **B** | weight alone: raw dots + Trend Weight, single axis                    |
| **C** | + a horizontal line at the **Goal**'s target weight                   |
| **D** | + the sloped **planned trajectory** from the Goal's start at its rate |

**Maintenance Mode is not a missing case, it is a decided one.** ADR 0008 rules a
defended target weight and guard band out of scope, so with no **Goal** there is
nothing to draw a reference against and C and D collapse to B. The toggle exists
to make that visible rather than to leave it looking unfinished.

### Finding: any Goal reference costs the weight axis its resolution

Measured, not predicted — though it was predicted:

- **C is unusable at 28 days.** The target is 75.0 kg and the window's own range
  is 78.7–80.4, so including it flattens four weeks of real movement into a
  straight line across the top with two-thirds of the card empty.
- **D is better but pays the same tax**: the plan sits ~3.5 kg below actual (the
  stub is deliberately behind pace), so the domain stretches to 75.7–80.4 and the
  trend still compresses into the top third.
- **B — and therefore Maintenance Mode — reads best of all.** Domain 78.7–80.4,
  and the trend and its scatter fill the plot.

The tension is structural, not cosmetic: a **Trend Weight** chart exists to
resolve one to two kilograms of movement, and a **Goal** lives five to seven
kilograms away. They cannot share a y-axis at a useful scale. Which is worth
noticing against what already ships — `GoalProgressHero` states the plan
_numerically_ (start, target, planned finish, rate, observed rate) directly above
this card, and numbers do not have a y-axis to compress.

### Round 3 verdict

**D won.** The section **degrades rather than disappearing**: a weight-only user
gets raw dots + **Trend Weight** on a single axis, _plus the **Goal**'s planned
trajectory_ — the sloped line from the Goal's start weight (the Trend Weight when
it was set, ADR 0016) at its chosen rate. In **Maintenance Mode** that line has
nothing to be drawn from, so the same component renders B, by ADR 0008's decision
and not by omission.

So the section is not gated on **Calorie Tracking** the way the **Intake
Breakdown** and the **Micronutrient Intake** are. The calorie half is the
_addition_; the weight half is the premise. Two consequences that follow and are
not optional:

- The backend cannot answer this with one tracking-gated endpoint — the weight
  series has to be available to a user with no intake at all.
- The feature stops being "weight vs calories" and becomes "your weight, with what
  you ate behind it", which is a different PRD framing from the one this grill
  opened with.

**Accepted with its cost, stated:** the axis compression above is real and, unlike
C's, it is _unbounded in one direction_. The domain must stretch to include the
plan line, so the further behind plan a user falls the flatter their own trend
draws — someone 10 kg behind gets a straight line across the top of the card, and
that is exactly the user for whom the chart matters most. Worth a rule at build
time (clamp the domain and let the plan line leave the frame, or bound how far the
plan may stretch it); not settled here.

**Settled in the grill straight after, not prototyped: the planned trajectory is
weight-only.** It does not appear when Calorie Tracking is on. Not for visual
reasons — a third series on the already-compressed weight axis is merely the
symptom — but because the two settings answer "am I on track?" with different
evidence. With tracking on, the _calorie_ half answers it: intake under the Budget
line is the mechanism and the falling trend is the confirmation. With tracking off
there is no mechanism to show, so the plan line is the only thing that can. The
cost is that a tracking user never sees their plan spatially and
`GoalProgressHero` is their only source — which is the same argument that killed
variant C, now cutting the other way, and is accepted.

---

## Findings banked (independent of any variant)

**`vue-chrts` cannot build this chart** — the library already paid for on
`/review` (221 KB gzip, F14).

- No **point/marker** option on any line series, so raw Weight Measurements
  cannot be dots.
- `DualChart` maps `barYAxis` to the primary axis and `lineYAxis` to the
  **secondary** one, so a **Calorie Budget** line cannot share the calorie axis
  with the bars — which round 1 just chose.

Real options: hand-rolled SVG (no new dependency, full control, ~200 lines — what
this prototype does), or `@unovis/vue`, already in the store transitively at
1.6.7 under `vue-chrts`, which would become a direct dependency and whose
`XYContainer` allows a per-component `yScale` — the thing `DualChart` hides.
**Decide in the grill, not here.**

### Raw readings as `dots` vs `line` — toggle in the card header

The `line` mode is the _honest_ alternative: broken at missed weigh-ins, so it
does not interpolate across a day the scale never saw. That removes the argument
people usually reach for and leaves the one that decides it: **a second line
asserts that raw weight is a series worth reading as a trend**, which is the claim
`CONTEXT.md` and ADR 0016 exist to refuse. At 28 days the raw line crosses the
trend a dozen times and the two green strokes read as two competing readings of
one thing. At 90 days of daily weighing the dots become a band and the distinction
narrows — so if 90 were the default the argument would weaken.

Dropping dots would unblock `vue-chrts` for the _bars-alone_ and _rolling-mean_
shapes only. Round 1 chose neither, so the library question stands regardless.

## Round 2 verdict

**C won** — an unlogged day draws a **baseline tick**, and the **Calorie Budget**
line **spans** it.

The tick is the whole of the answer, and it has to be: nothing else on the chart
distinguishes a day with no **Entry** from a day at the floor.

**The Budget line spanning the gap is right, and my recommendation to break it was
wrong.** A Budget is set by a **Weekly Review** and holds steady all week
(ADR 0018) — it applied on the unlogged day exactly as it applied on the ones
either side. Breaking the line asserts the Budget lapsed because the User stopped
recording, which is false, and it fragmented a 28-day chart into three runs that
read like three charts. What made a gap look like zero was never the line's
continuity; it was the absence of any mark, and the tick is what fixes that.

Residual risk to watch when this is built for real: a tick sits exactly where a
very small day's bar would, so "no entry" and "a 60 kcal day" are one pixel apart.
The hover readout says `not logged` and the caption counts logged days, so there
are two other channels carrying it — but the tick alone is ambiguous, and if it
ever has to stand on its own it needs to stop being bar-shaped.
