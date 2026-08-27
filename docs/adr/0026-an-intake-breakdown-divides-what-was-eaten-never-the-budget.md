# An Intake Breakdown divides what was eaten, never the Budget

An **Intake Breakdown** states each **Food**'s share of the calories a **User**
actually logged over a window — the user's local day, or the trailing seven days
— and the **Calorie Budget** appears nowhere in it. Every slice carries what it
*returned* in protein alongside what it cost in calories, for the same reason a
**Check** does. It is a description of a diet, never a ranking of Foods.

_Status: accepted; extends [0022](0022-a-check-states-cost-and-return-and-never-labels-a-food.md)'s
no-good-or-bad rule to a second surface while deliberately **not** reusing its
denominator; honours [0002](0002-business-logic-belongs-in-the-backend.md) and
[0014](0014-client-owns-today.md). The domain term lives in
[`CONTEXT.md`](../../CONTEXT.md)._

## Context

Tucker could say what a day cost and what a single product would cost, and could
say nothing at all about *pattern* — which of the things a User eats week after
week is where their calories actually go. The Today screen lists a day's Entries
and the Weekly Review ledger tracks the targets; neither answers "what takes up
most of my diet?".

The obvious shape for that answer is a share, and Tucker already has a
well-established denominator for a share: ADR 0022 fixed that a **Check** states
cost as a share of the **whole Calorie Budget**, never of what is left, so the
same product reads the same at 9am and 8pm. Reaching for that denominator here is
the default a reader would expect — and it is what this ADR rejects.

## Decision

**The denominator is the calories logged in the window.** Slices sum to the
window's intake, not to a target.

Three things follow from that, and each is why it was chosen:

- **It renders identically over and under budget.** With the Budget as the
  denominator, a day under budget leaves an unspent wedge, and a day *over* it
  cannot be drawn at all — a ring has no room past 100%. Tucker already has a
  rule for that case (`ringFraction` clamps an over-target arc to full and the
  *number* says "312 kcal over"), but clamping silently rescales every slice, so
  each one's stated percentage stops matching its drawn size. A chart whose
  labels and geometry disagree is worse than no chart.
- **The ranking is unaffected either way.** Slice order and relative size do not
  depend on the denominator; only the scale does. So the Budget bought nothing
  the question needed, at the cost of a case it could not draw.
- **The Budget denominator answers a different question.** "How much of my day
  did this cost" is the **Check**'s question and already has a home. This one is
  "where did my calories go", and it is a fact about the week rather than about a
  target — so it stays meaningful for a window in which the Budget itself moved.

**Protein rides along on every slice.** The measure is calories (an **Estimated
Entry** has no mass, so grams could never be universal), which means the biggest
slice is very often the protein source — chicken breast, eggs, skyr. A ranking
that states only cost reads as a hit list, and "cut your biggest item" is exactly
the advice the no-good-or-bad rule exists to refuse. Stating cost *and* return on
each row is ADR 0022's move applied to a second surface, from figures the Entries
already carry. Unknown protein on an Estimated Entry is omitted rather than
stated as zero — the rule the entry rows already follow.

**A Recipe is one slice, under its own name.** An Entry snapshots its calories,
and a Recipe's ingredients and cooked weight can be edited afterwards
([0019](0019-recipe-density-is-a-representative-batch-estimate.md)), so
attributing a past Entry through today's ingredient list would report a meal that
was never eaten. The chilli is also the thing the User actually ate.

**An Estimated Entry slices by its label**, flagged as an estimate, rather than
collapsing into one bucket. Eating out is a diet item: for a User who eats out
three times a week, a lumped "Estimated" wedge would hide their single biggest
one behind a grey slice with no name. How much of a window was guessed is a real
question, and `DailyLog.estimatedCalorieShare` already answers it.

**The backend ranks, the client folds.** `GET /api/intake-breakdown?from=&to=`
returns every item with its calories, protein and share, already sorted, with the
window supplied by the client ([0014](0014-client-owns-today.md)). The share is
derived state and belongs in the backend ([0002](0002-business-logic-belongs-in-the-backend.md));
"eight fit on a ring before the palette runs out of validated hues" is a fact
about a chart, so the fold into **Other** — and expanding it — happens in the
client, with no second request.

**The response says how much of its window was logged.** Alongside the items it
carries the number of days in the window that hold an **Entry**, because the width
of a window is no evidence that it was lived in and a seven-day breakdown built
from three logged days should be discounted rather than read at face value. Only
that count is on the wire: the window's *width* is `from`..`to`, which the response
already states, so the client reads the denominator off the answer it was given
rather than off the button the User last pressed — the two disagree for the length
of a round-trip.

## Considered options

- **Slices as shares of the Calorie Budget, with an unspent wedge.** The first
  instinct, and the shape the feature was originally described in. Rejected on
  the over-budget case above, and on a second problem the prototype made obvious:
  at 9am a day is mostly unspent, so the composition the chart exists to show is
  squeezed into a corner of it.
- **Budget as calibration rather than geometry** — slices sized by intake, each
  row also stating its share of the Budget. Keeps both denominators on screen and
  reuses the Check's phrasing exactly. Rejected as two denominators in one
  legend: "20%" and "19% of budget" on the same row is the collision the glossary
  exists to prevent.
- **Exploding a Recipe into its ingredients.** More actionable for shopping, and
  it would merge mince eaten in the chilli with mince eaten alone. Rejected: it
  re-derives history from a mutable definition.
- **A single lumped "Estimated" slice.** Honest about precision, immune to the
  typo-splitting that free-text labels invite. Rejected on the eating-out case.

## Consequences

- **Tucker takes on a categorical palette.** Until now `DESIGN.md` spent colour
  on green and coral and reserved the status hues, under a "spend boldness only
  on a ring" rule. A composition ring needs identity colour, so eight hues are
  added, validated for colour-vision separation and contrast against Tucker's own
  light and dark card surfaces. Three of the light steps fall under 3:1, so the
  **labelled legend is load-bearing, not decoration** — the ring and its rows
  ship together, and identity is never carried by colour alone.
- **The tail is folded, and that fold is visible.** Past eight items everything
  becomes one **Other** slice naming how many it holds, expandable to the full
  list. A week routinely produces fifteen to twenty distinct items; a prototype
  run at six named slices put "Other" *second*, at 28% — a chart whose loudest
  answer was "miscellaneous". **Other's protein is stricter than a slice's**: a
  slice sums what it knows and omits only when nothing in it carried a figure,
  while Other is omitted unless *every* Food it folded carried one. A slice merges
  Entries of one Food, where summing the known understates the same thing; Other
  merges different Foods, so one unmeasured estimate among weighed ones would put a
  confident figure against a row whose calories are mostly unmeasured — and Other
  is deliberately never flagged an estimate, so nothing on screen would hint at it.
  A revealed row states its own figures normally.
- **Free-text estimate labels split.** "Thai place" and "thai" are two slices.
  Normalising on trimmed, case-folded text catches the common case; the rest is
  accepted rather than solved, because the alternative is guessing that two
  different words meant the same meal.
- **A one-item window draws a full circle.** Early in a day the ring can be a
  single slice at 100%. Accepted deliberately: one shape, no conditional
  branches, and it self-corrects as the day fills. An *empty* window keeps the
  section (with a "nothing logged" line) rather than hiding it, so the period
  toggle stays reachable.
- **Absent with Calorie Tracking off**, and gated explicitly rather than left to
  the data. The first draft of this decision said no gate was needed, on the
  reasoning that such a User logs no Entries — but the setting is not a one-time
  choice at setup (`CONTEXT.md`, Calorie Tracking), so the window is not reliably
  empty: someone who logs breakfast and turns tracking off at lunchtime has a full
  *today* window all afternoon, and the trailing-seven-day window survives a
  flip-off for a week. Ungated, the section would also render "Nothing logged yet"
  at a User Tucker has agreed to stop asking about eating — the shape F12 removed
  from `/` — and spend a request per `/review` load to do it. The gate is in the
  page's setup, which means reading `Calorie Tracking` there rather than in a
  template: that read races the navigation's own, so `useCalorieTracking` exposes
  `ready()`, memoising the one in-flight read so a page joins it instead of
  issuing a second.
