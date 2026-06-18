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

**Budget Projection**:
A forecast of whether logging a prospective **Entry** would push the day over the
**Calorie Budget** — the over-budget rule applied to the day's intake *plus* one
not-yet-logged Entry. Computed before the Entry is committed, so Tucker can warn
that it would exceed the Budget and by how many calories. The user may log it
anyway: the projection informs the choice, it never blocks it. Defined only while a
Calorie Budget exists, and about calories alone — the **Protein Floor** is a
minimum, not a ceiling, so it has no projection.
_Avoid_: budget check, calorie warning, what-if

### Goals

**Goal**:
A weight-loss target the user sets: a goal weight plus a rate of loss (e.g.
0.5 kg/week). The app derives the Calorie Budget and a projected finish date.
Each Goal carries its own start date and starting weight, captured at the
moment it's set. The starting weight is the **Trend Weight** at that moment —
the backend derives it, the user never enters it — so progress is measured
trend-to-trend and a fresh Goal reads 0% (start == now). It is *not* the raw
reading on the scale that day, which lags or leads the trend; that reading lives
on in the Weight-Measurement history. Changing target or rate mid-cut means
*replacing* the active Goal: the prior one is preserved as inactive history, not
edited in place.
A Goal is **reached** when the Trend Weight first meets its target. Reaching
*latches* — it stays reached even if the trend later drifts back up — and is
recorded as the date it happened. A reached Goal is not resolved automatically:
the user either switches to **Maintenance Mode** (deactivating it) or replaces it
with a lower Goal; until they choose, the Goal stays active and reached.
_Avoid_: target

**Calorie Budget**:
The app-derived daily calorie target the user logs against. Equals Maintenance
minus the deficit implied by the active Goal's rate — or Maintenance itself when
no Goal is active (see **Maintenance Mode**). Recomputed once a week and held
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

**Maintenance Mode**:
The app's resting state whenever no Goal is active. With no deficit to chase, the
Calorie Budget equals Maintenance, while the Protein Floor still applies (2 g/kg
of Trend Weight). It is not a stored object — it is the *derived* condition of
having no active Goal, so the app is equally usable as a pure maintenance tracker
that never sets a Goal at all. The user enters it three ways: by switching out of
a **reached** Goal (the user's choice at the two-way fork, never automatic), by
ending an unreached Goal manually, or by never setting one. A Goal is the
temporary weight-change campaign layered over this baseline; ending one — or
switching out of a reached one — drops back to Maintenance Mode.
_Avoid_: maintenance goal, rate-zero goal, rest mode

**Weekly Review**:
The adaptive engine's recompute event — and the dated historical record it
leaves behind. Each review re-derives Maintenance from the Trend Weight and
logged intake, then the Calorie Budget and Protein Floor for the coming week.
Clock-driven reviews are held steady — never changed once written — but a
deliberate **Goal** change (creating or replacing one) force-recomputes today's
review, overwriting any same-day record so the new Budget and Floor take effect
immediately rather than at the next cadence. It is the _only_ place Maintenance,
the Budget, and the Floor are (re)computed; `/today` shows the latest review's
figures. Reviews fire by **lazy catch-up**: on app use, if the latest review
is a week or more old, the engine runs one review snapping to today (it does
not replay each missed week — the adaptive window already looks back two
weeks). A manual "run now" trigger and a **Goal**-change recompute also exist.
There is no scheduler. Every recompute is stamped on the user's _local_ today —
the client supplies it, the server never substitutes its own wall-clock day (the
"client owns today" boundary rule; see [ADR 0014](docs/adr/0014-client-owns-today.md)
and **Weight Measurement**).
_Avoid_: recalculation, recompute (as a noun)

**Profile**:
The user's personal settings — both the body inputs to the BMR seed (sex, birth
date, height) and the user's locale: their **timezone** (an IANA zone, e.g.
`Europe/Copenhagen`) and weekly-**Reminder** preferences (the local hour to nudge
at, and whether reminders are on). The body inputs are set once and rarely
changed; combined with the latest Weight Measurement they seed the initial
Maintenance estimate. The timezone is user-level state (one human, one local day),
defaulted from the browser when first captured — it is the proper home for "the
user's local today," which weight-dating approximates client-side today. As Tucker
grows multi-user this is the per-user record the reminder engine iterates.

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
- The **plan**: the Trend Weight's journey from the Goal's start weight (itself
  the Trend Weight when the Goal was set, so the journey is trend-to-trend) toward
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

**Drift Status**:
The **Maintenance Mode** counterpart of **Pace Status**. With no **Goal** to pace
against, the observed pace — the slope of the **Trend Weight** over the trailing
28 days — is classified against a target rate of *zero* within a tolerance band:
*holding* inside the band, *drifting up* or *drifting down* outside it. Like the
observed pace it draws on, it is withheld until at least 14 days of **Weight
Measurements** exist. It is a displayed status, not an alert: the self-correcting
**Calorie Budget** already responds to drift at the next **Weekly Review**.
Intentional weight gain (a bulk) is *not* drift — but Tucker has no surplus Goal
yet, so today a deliberate gain reads as *drifting up*.
_Avoid_: drift alert, weight alarm

### Reminders

**Weekly-Review Reminder**:
A web-push notification that nudges the user to open Tucker when a **Weekly
Review** has come due and they've been away. It does *not* run the review — the
review still computes lazily on next app open; the Reminder only pulls a
drifted-away user back. It fires from Tucker's one notification job (see
[ADR 0010](docs/adr/0010-minimal-scheduler-for-the-weekly-reminder.md)) when the
latest review is a week or more old, the user has a **Push Subscription**, and
they haven't opened the app today — delivered at the user's local reminder hour
(their **Profile** timezone + chosen hour). "Opened the app today" is read from
the user's **last-seen day**, stamped on each daily-summary read (on the client's
local day, never the server clock). At most one Reminder per overdue episode: it
is deduped against the instant the **last Reminder was sent** — suppressed while
that is after the latest review's date, and re-armed when opening the app writes a
fresh review whose date moves past it. A displayed nudge, never a guilt-trip.
_Avoid_: alert, notification, push (as the noun for the user-facing nudge)

**Push Subscription**:
One device's Web Push registration — the browser-issued endpoint and its keys —
that Tucker stores so it can deliver a **Weekly-Review Reminder** to that device
while the app is closed. One per device: a user's phone and laptop are separate
Subscriptions, and the same Reminder fans out to all of them. Pure transport — it
carries no schedule and no timezone (those belong to the user, on the **Profile**).
Pruned when the browser reports it gone. On iOS a Subscription can only be created
once Tucker is installed to the home screen; on Android and desktop it can be
created from the browser tab.
_Avoid_: device token, push token, registration

## Relationships

- Every **Entry** is either a **Weighed Entry** or an **Estimated Entry**
- A **Weighed Entry** references exactly one **Food** and a mass in grams
- An **Estimated Entry** references no **Food** — it carries its own calorie figure
- A **Food** is referenced by zero or more **Weighed Entries**
- A **Recipe** is a kind of **Food**; its nutrition is the rollup of its ingredient **Foods**
- A day's calories consumed is the sum of calories across that day's **Entries**
- The **Calorie Budget** equals **Maintenance** minus the active **Goal**'s deficit,
  or **Maintenance** itself when no Goal is active (**Maintenance Mode**)
- The **Protein Floor** scales from the current **Trend Weight** independent of any
  **Goal**, so it still applies in **Maintenance Mode**
- A **Goal** and the current **Trend Weight** yield **Goal Progress** — how far the
  trend has moved toward the target and when, at the Goal's rate, it's projected to arrive
- **Maintenance** is corrected over time from **Entries** and the **Trend Weight**
- A day is **on-target** once the **Protein Floor** is met and intake is at or under the **Calorie Budget**; it is **over budget** the moment intake exceeds the **Calorie Budget**. An in-progress day in neither state has no verdict — being under the floor mid-day isn't a failure, the day just isn't finished.
- A **Budget Projection** applies the over-budget rule to the day's intake plus a prospective **Entry**, warning before it's logged; the user may log it regardless
- A **Weekly-Review Reminder** is sent when a **Weekly Review** is overdue and the
  user has at least one **Push Subscription** — it nudges, it never computes the review
- A user has zero or more **Push Subscriptions** (one per device); each **Weekly-Review
  Reminder** fans out to all of them, at the hour set on the user's **Profile**

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
