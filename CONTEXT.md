# Tucker

Tucker is a personal diet tracker. The user logs the foods they eat so the app
can calculate calories consumed and track progress toward a weight-loss goal.

## Language

### Logging

**Food**:
A reusable definition of something edible — a name plus nutrition per 100g
(protein, carbs, fat). Calories per 100g are **derived**, not entered: a
Food's calorie figure is always `4 × protein + 4 × carbs + 9 × fat` (the
standard Atwater factors, per gram, scaled to 100g). The user supplies the
three macros; the app computes calories. Created once (e.g. by scanning a
barcode or entering manually), then referenced by many Entries. A Food created by
**barcode scan** is shared product data — global, one per barcode, identical for
every user — whereas a **Recipe** or a hand-entered Food is private to whoever
created it; correcting a shared Food forks a private copy rather than changing it
for everyone. (Tucker is single-user today; this is the ownership model it grows
into — the global `barcode` uniqueness already assumes it.)
_Avoid_: food item, product

**Recipe**:
A composite Food: defined once from ingredient Foods, their weights, and the
finished dish's cooked weight, then rolled up into per-100g nutrition. Logged
like any other Food — you weigh your portion. The third way to create a Food,
alongside barcode scan and manual entry.

**Nutrition Provider**:
An external source of nutrition data Tucker integrates with to autofill a new
Food — Open Food Facts, USDA FoodData Central, and the like. Tucker is
Provider-agnostic, but the set of Providers and the order they're tried is
**Tucker's** choice, not the user's: the API subscriptions and keys belong to
Tucker, so which sources to trust is a platform decision. A barcode scan first
checks the catalog, then tries each configured Provider that supports barcode
lookup, in order, taking the first match. A Provider may support barcode lookup,
free-text search, or both; only barcode-capable ones take part in a scan. Whatever a Provider returns is normalised to Tucker's per-100g macro
model — and its calories re-derived by the Atwater rule, exactly like a
hand-entered Food. The Provider's own stated energy is shown only as a cross-check
at confirmation, never stored: scanned Foods follow the same calorie rule as every
other Food.
_Avoid_: nutrition API, food database, data source

**Food Candidate**:
Normalised, unsaved nutrition the user reviews before confirming it into a Food.
Produced by a barcode lookup that misses the user's catalog but hits a Nutrition
Provider: it carries the macros the Provider supplied (some possibly absent), the
Provider it came from, that Provider's stated energy (shown as a cross-check, not
stored), and the scanned barcode. The user completes any missing macro and
confirms — only then does it become a Food. A catalog hit, by contrast, returns
an existing Food directly, not a Candidate.
_Avoid_: result, product, match, scan result

**Entry**:
One occurrence of the user eating a Food — a date, a quantity, and the resulting
calories. Creating an Entry is what "logging" means.
_Avoid_: log, record

**Weighed Entry**:
An Entry whose quantity is a mass in grams, measured on a kitchen scale. The
precise, default case. Calories = grams ÷ 100 × the Food's calories-per-100g.

**Estimated Entry**:
An Entry for a meal that can't be weighed or scanned (restaurant, canteen, on the
go) — a name plus an estimated calorie figure, with no Food and no mass. Always
flagged as an estimate so the app can report how much of a day was guessed.

### Goals

**Goal**:
A weight-loss target the user sets: a goal weight plus a rate of loss (e.g.
0.5 kg/week). The app derives the Calorie Budget and a projected finish date.
Each Goal carries its own start date and starting weight, captured at the
moment it's set. Changing target or rate mid-cut means *replacing* the active
Goal: the prior one is preserved as inactive history, not edited in place.
_Avoid_: target

**Calorie Budget**:
The app-derived daily calorie target the user logs against. Equals Maintenance
minus the deficit implied by the Goal's rate. Recomputed once a week and held
steady in between, so it stays a stable habit.
_Avoid_: limit, allowance

**Protein Floor**:
The minimum daily protein intake: 2 g per kg of current Trend Weight, recomputed
at the weekly review. A floor to stay above — the counterpart to the Calorie
Budget's ceiling. Together they protect muscle while losing fat.
_Avoid_: protein target, protein goal

**Maintenance**:
The estimated daily calories that hold the user's weight steady (their TDEE).
Seeded from a standard BMR formula, then recomputed each week from the
Trend Weight and logged intake once enough history exists.
_Avoid_: TDEE, baseline

**Weekly Review**:
The adaptive engine's recompute event — and the dated historical record it
leaves behind. Each review re-derives Maintenance from the Trend Weight and
logged intake, then the Calorie Budget and Protein Floor for the coming week,
and is never changed once written. It is the _only_ place Maintenance, the
Budget, and the Floor are (re)computed; `/today` shows the latest review's
figures. Reviews fire by **lazy catch-up**: on app use, if the latest review
is a week or more old, the engine runs one review snapping to today (it does
not replay each missed week — the adaptive window already looks back two
weeks). A manual "run now" trigger also exists. There is no scheduler.
_Avoid_: recalculation, recompute (as a noun)

**Profile**:
The user's body inputs to the BMR seed: sex, birth date, and height. Set
once and rarely changed. Combined with the latest Weight Measurement, it
seeds the initial Maintenance estimate.

**Weight Measurement**:
A single dated reading of the user's body weight. The raw, noisy signal behind
goal progress and the adaptive Maintenance correction. It can't be dated in the
future, where "today" is the user's _local_ day — the client supplies it, so a
reading entered just after local midnight isn't rejected while the server (UTC)
clock still lags a day behind.
_Avoid_: weigh-in

**Trend Weight**:
A smoothed, exponentially-weighted average of recent Weight Measurements. Goal
progress and the adaptive Maintenance correction both run on the Trend Weight,
never on a single raw measurement.
_Avoid_: average weight

**Goal Progress**:
How far the active **Goal** has come, and whether it's on track. Two
complementary readings, both computed on the smoothed **Trend Weight**, never a
single raw measurement:
- The **plan**: the Trend Weight's journey from the Goal's start weight toward
  its target — kilograms still to go, percent complete, and, at the Goal's chosen
  rate, a projected (*planned*) finish date.
- The **observed pace**: how fast the trend is *actually* moving — the slope of
  the Trend Weight over the trailing 28 days, expressed as an observed rate of
  loss (kg/week) and an *observed* finish date projected from it. The observed
  pace is withheld until at least 14 days of **Weight Measurements** exist.
_Avoid_: ETA, projection

**Pace Status**:
Whether the **observed pace** is keeping up with the **Goal**'s planned rate:
*behind*, *on-pace*, or *ahead*, classified against the planned rate within a
±20% band. When the trend isn't falling (observed rate ≤ 0) the status is
*stalled* and no observed finish date is projected. Like the rest of the observed
pace, it's withheld until at least 14 days of **Weight Measurements** exist.

## Relationships

- Every **Entry** is either a **Weighed Entry** or an **Estimated Entry**
- A **Weighed Entry** references exactly one **Food** and a mass in grams
- An **Estimated Entry** references no **Food** — it carries its own calorie figure
- A **Food** is referenced by zero or more **Weighed Entries**
- A **Recipe** is a kind of **Food**; its nutrition is the rollup of its ingredient **Foods**
- A day's calories consumed is the sum of calories across that day's **Entries**
- A **Goal** yields one **Calorie Budget**, computed from **Maintenance** and the rate
- A **Goal** also yields a **Protein Floor**, scaled from the current **Trend Weight**
- A **Goal** and the current **Trend Weight** yield **Goal Progress** — how far the
  trend has moved toward the target and when, at the Goal's rate, it's projected to arrive
- **Maintenance** is corrected over time from **Entries** and the **Trend Weight**
- A day is on-target when intake is under the **Calorie Budget** and over the **Protein Floor**

## Example dialogue

> **Dev:** "When the user scans a barcode, does that create an Entry?"
> **Domain expert:** "No — scanning creates a **Food**. The user still has to say
> *when* they ate it and *how much*. That's the **Entry**."

> **Dev:** "If the user weighs in 1 kg heavier one morning, does the Calorie
> Budget drop?"
> **Domain expert:** "No — one **Weight Measurement** is noise. **Maintenance** is
> corrected from the **Trend Weight**, so the **Budget** only moves when the trend
> genuinely shifts."

## Flagged ambiguities

- "food item" was used for both the reusable definition and the act of eating it
  — resolved: the definition is a **Food**, the eating event is an **Entry**.
- "meal" is used loosely — resolved: there is no Meal object. "Manually entering a
  meal" is just a flow that creates several **Weighed Entries** at once; "meal" is
  the user's word for a batch of Entries logged together.
- Liquids vs solids — resolved: everything is weighed in grams, liquids included.
  A scanned drink published per 100 ml is treated as per-100g — Tucker assumes
  water density (1 g/ml) rather than a per-product density. A small, accepted
  inaccuracy for denser drinks, which the user can correct at Food Candidate
  confirmation (where the Provider's stated energy is shown as a cross-check).
