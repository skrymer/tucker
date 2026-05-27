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
barcode or entering manually), then referenced by many Entries.
_Avoid_: food item, product

**Recipe**:
A composite Food: defined once from ingredient Foods, their weights, and the
finished dish's cooked weight, then rolled up into per-100g nutrition. Logged
like any other Food — you weigh your portion. The third way to create a Food,
alongside barcode scan and manual entry.

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
Seeded from a formula (Mifflin-St Jeor), then recomputed each week from the
Trend Weight and logged intake once enough history exists.
_Avoid_: TDEE, baseline

**Weight Measurement**:
A single dated reading of the user's body weight. The raw, noisy signal behind
goal progress and the adaptive Maintenance correction.
_Avoid_: weigh-in

**Trend Weight**:
A smoothed, exponentially-weighted average of recent Weight Measurements. Goal
progress and the adaptive Maintenance correction both run on the Trend Weight,
never on a single raw measurement.
_Avoid_: average weight

## Relationships

- Every **Entry** is either a **Weighed Entry** or an **Estimated Entry**
- A **Weighed Entry** references exactly one **Food** and a mass in grams
- An **Estimated Entry** references no **Food** — it carries its own calorie figure
- A **Food** is referenced by zero or more **Weighed Entries**
- A **Recipe** is a kind of **Food**; its nutrition is the rollup of its ingredient **Foods**
- A day's calories consumed is the sum of calories across that day's **Entries**
- A **Goal** yields one **Calorie Budget**, computed from **Maintenance** and the rate
- A **Goal** also yields a **Protein Floor**, scaled from the current **Trend Weight**
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
  A scanned drink published per 100 ml is converted to per-100g once, at Food
  creation, using a density.
