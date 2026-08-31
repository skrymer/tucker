# Tucker

Tucker is a personal diet tracker. Each **User** logs the foods they eat so the
app can calculate calories consumed and track progress toward a weight-loss
goal. Tucker is multi-user by invitation but never social — a User's data is
theirs alone.

## Language

### People

**User**:
One person using Tucker, and the owner of everything in it — their **Foods** and
**Recipes**, **Entries**, **Weight Measurements**, **Goals**, **Weekly Reviews**,
**Profile**, and **Push Subscriptions**. Users are strictly isolated: nothing one
User records is visible to another, and nothing is shared between them. The single
exception is a **Push Subscription**, and it is not sharing: a device belongs to
whoever opted in on it last, so subscribing on a browser somebody else had
subscribed *takes it over* rather than adding a second claim to it. The row still
has exactly one owner, and neither User learns anything about the other. A User is
**invited**, never self-registered — an operator admits their email address, and
the User comes into being the first time they open Tucker. The email address
identifies the person, but everything Tucker stores hangs off the User rather
than the address, so the address can change without touching their history —
today that change is an operator step, not something a User can do themselves.
_Avoid_: account, member, profile (a **Profile** is a User's settings, not the User)

### Logging

**Calorie Tracking**:
Whether a **User** logs what they eat. On, Tucker is the full diet tracker:
**Entries** counted against a **Calorie Budget** and a **Protein Floor**. Off, it
is a goal and weight tracker — **Weight Measurements**, the **Trend Weight**, a
**Goal** and its progress — and nothing asks the user what they ate. It is a
deliberate setting on the **Profile**, never inferred from a quiet fortnight: a
User who has logged nothing has *lapsed*, which is not the same as having chosen
not to log, and a User who has chosen not to log would have no way back in if the
choice were read off their silence. Weight is not the symmetric half of a pair —
it is the spine. Calorie Tracking may be off, but a User with no Weight
Measurements has no Trend Weight, and therefore no **Maintenance**, no Floor and
no Goal Progress, so there is no "calories but no weight" User to be.
Switching it on and off is ordinary, not a one-time decision at setup.
_Avoid_: food logging (a Weight Measurement is logged too), tracking mode,
weight-only mode

**Food**:
A reusable definition of something edible — a name plus nutrition per 100g
(protein, carbs, fat). Calories per 100g are **derived**, not entered: a
Food's calorie figure is always `4 × protein + 4 × carbs + 9 × fat` (the
standard Atwater factors, per gram, scaled to 100g). The user supplies the
three macros; the app computes calories. Created once (e.g. by scanning a
barcode or entering manually), then referenced by many Entries. Every Food —
scanned, hand-entered, or a **Recipe** — belongs to exactly one **User** and is
visible only to them. There is no shared catalog: the same barcode may exist
once per User, and correcting a Food changes it for its owner alone. Scanning a
product another User has already scanned is still fast, because the *lookup* is
cached across Users (see **Nutrition Provider**) — but what it produces is the
scanning User's own Food.
A Food referenced by at least one **Entry** — or used as an ingredient in a
**Recipe** — **cannot be deleted**. Entries are permanent history, and a Recipe's
ingredients are part of its definition, so a referenced Food is rejected (it stays
in the catalog) with a message naming what references it; only a Food that is
neither logged nor an ingredient can be removed.
_Avoid_: food item, product

**Recipe**:
A composite Food, defined once from ingredient Foods and rolled up into per-100g
nutrition. Two weights, meaning different things:

- Each **ingredient** is weighed **as added** — its per-100g must match the form
  weighed in (raw mince uses raw-mince values). The sum across ingredients is the
  batch's **total** calories and protein.
- The **cooked weight** is what the finished dish weighs on the scale after
  cooking. Cooking changes only the dish's weight — water carries no calories or
  protein — so the total is conserved and simply re-expressed per 100g of the
  cooked weight (`per-100g = total ÷ cooked weight`). A dish that loses water is
  denser per gram; one that absorbs it (pasta, rice) is lighter.

The cooked weight is a **representative batch**, not a per-batch measurement:
cook the same recipe longer another day and the real density shifts a little.
That drift is a bounded estimate (it never touches the total, only how a portion
is sliced out of it) and sits below the estimation error already in any Food's
per-100g — the same way a supermarket ready-meal's label is a batch average. A
Recipe's cooked weight (hence its density) can be **edited** to recalibrate; because
**Entries snapshot** their calories, editing a Recipe never rewrites past logs, only
future ones. Logged like any other Food — you weigh your portion of the finished
dish. The third way to create a Food, alongside barcode scan and manual entry.

**Nutrition Provider**:
An external source of nutrition data Tucker integrates with to autofill a new
Food — Open Food Facts, USDA FoodData Central, and the like. Tucker is
Provider-agnostic, but the set of Providers and the order they're tried is
**Tucker's** choice, not the user's: the API subscriptions and keys belong to
Tucker, so which sources to trust is a platform decision. A barcode scan first
checks the catalog, then tries each configured Provider that supports barcode
lookup, in order, taking the first match. A Provider may support barcode lookup,
free-text search, or both; only barcode-capable ones take part in a scan. A
Provider answering *no match* and a Provider unable to answer at all are different
results and are never collapsed into one — see **Inconclusive Lookup**. Whatever a Provider returns is normalised to Tucker's per-100g macro
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

**Inconclusive Lookup**:
A barcode lookup that reached no verdict, because no **Nutrition Provider** could
answer — unreachable, timed out, rate-limiting, or answering unintelligibly. It is
the difference between *the answer is no* and *there is no answer*, and it is not a
miss: a miss is itself an answer, given by every barcode-capable Provider being
asked and none knowing the product. The two earn opposite advice — a missed product
will never resolve, so move on; an Inconclusive one may resolve a minute from now,
so try again. Left unsaid, an Inconclusive Lookup is worse than useless: the user
hand-enters a product a Provider knows perfectly well, and because that saved Food
then wins the catalog-first lookup forever, one bad minute degrades the catalog
permanently. A lookup is a miss only when *every* barcode-capable Provider
answered; if any could not, the lookup is Inconclusive. Never cached, so it can
never stick.
_Avoid_: error, failure, outage, provider down, offline

**Reference Food**:
A generic food in the Australian Food Composition Database — "Beef, mince,
regular, raw" — carrying the micronutrient detail a package label never does. A
**Food** may be **matched** to one, and then *borrows* its micronutrient profile:
the Food's own macros are unchanged and still derive its calories, and only the
vitamins and minerals come from the Reference Food, scaled by the grams eaten.
Borrowed, never copied — a Reference Food is not owned by any **User**, the match
is a pointer rather than a snapshot, and a new release of the database therefore
reaches every Food already matched to it. That is the opposite of how a **Nutrition
Provider** behaves, and deliberately: a Provider's macros are copied into the Food
at creation because they describe *that product* and are the user's to correct,
while a micronutrient profile is an estimate by analogy — *this is roughly chicken
breast* — that no one is ever going to hand-correct.
A **Recipe** is never matched. Its composition is already known, so rolling its
micronutrients up from whichever ingredients *are* matched — each weighed as added,
re-expressed over the cooked weight — always beats matching the finished dish to a
generic prepared one. Recipes therefore make matching easier rather than harder: a
recipe's ingredients are raw whole foods the database describes well, where a
branded packaged food often has no generic worth pointing at.
A match is **always confirmed by the user**. Tucker suggests one by name and the
user taps to accept it; nothing is matched silently, because a wrong match reports
a confident figure for a food that was never eaten. Australian labelling declares
only energy, protein, fat, saturated fat, carbohydrate, sugars and sodium, so a
scanned Food arrives with no micronutrients at all — matching is how it gets them,
and an unmatched Food simply contributes none (see **Reference Intake** on how much
of a window that leaves unaccounted for).
_Avoid_: generic food, AFCD food, food match, nutrient source, composition record

**Reference Intake**:
What a body of a given age and sex is published as needing of a nutrient — the
line a window's vitamin and mineral intake is read against. Tucker uses the
**Nutrient Reference Values** for Australia and New Zealand (NHMRC), which give a
recommended intake to reach and an **Upper Level** not to exceed; every **User** is
in Australia, so there is one set and it is never chosen per user or per food.
A Reference Intake is **not a target**, and the distinction is the whole reason
Tucker can carry it while staying diet-agnostic: a target is something Tucker
adapts and a **Weekly Review** commits to — the **Calorie Budget** and the
**Protein Floor**. A Reference Intake is a fixed published figure Tucker reads off
a table, never corrects, and never holds the user to. Keto and low-fat still track
identically, because the iron line is the same number under both.
Resolved from the **Profile**'s sex and age, taken **once at the end of the
window** rather than per day, so a window spanning a birthday has one answer.
Pregnancy and lactation shift several of these figures substantially and Tucker
has no field for either; the assumption is stated where the figures are read
rather than guessed at. Read **live**, never snapshotted: a **Calorie Budget** from
a past week is a commitment the user was held to and is preserved as it was, while
a Reference Intake is a measuring stick for a body *now* — if the published figure
was revised, the old reading was simply wrong. The edition in force is named
wherever the figures appear, or the user has no way to see that the line moved.
_Avoid_: RDI, RDA, daily value, target, requirement, recommended amount

**Micronutrient Intake**:
The vitamins and minerals a window's logged food supplied, each read against its
**Reference Intake** — the answer to "am I getting enough of everything?". Defined
over the trailing seven days and no shorter window: micronutrient intake is
enormously spiky day to day (one serve of liver is a week of vitamin A), so a
single day's figure is noise wearing a number's clothes. Stated as **a day's
average** over that window, because a Reference Intake is a daily figure — a
week's total read against a daily line clears almost every reference at once and
means nothing.
Vitamins and minerals, and **dietary fibre**. Energy and the other macros are
excluded, and protein most deliberately of all: it already has a **Protein Floor**
set from body weight, the published reference for protein is a quite different and
much lower figure, and carrying both would have Tucker contradicting itself about
the one macro it does target. Fibre is the one member that is not a micronutrient,
and it is admitted on the same test sodium passes rather than on the fact that AFCD
reports it: the NHMRC publishes a reference for it, it is read against a **window**
and never against a **Food**, and Tucker sets no target for it — so it stays a
**Reference Intake** and does not become an opinion about a diet.
**Every figure is a lower bound.** Only food that can contribute does — a
**Weighed Entry** whose **Food** is matched to a **Reference Food**, or a
**Recipe** through whichever of its ingredients are matched. An **Estimated Entry**
has no Food, so it can never contribute at all. What is summed is therefore *at
least* what was eaten, and the share of the window's calories that could contribute
is stated alongside it, always. Calories are the measure of that share for the same
reason they measure an **Intake Breakdown**: an Estimated Entry has no mass, so
grams cannot measure the very entries most likely to be missing.
A partly-matched Recipe contributes partly, and its calories count **fractionally**
toward the share above — by how much of the recipe's own calories came from matched
ingredients. All-or-none would throw away something measured. Rolling a past Entry
up through the Recipe's *current* ingredients is deliberate and is not the thing an
**Intake Breakdown** refuses: that rule protects a figure the Entry snapshotted, and
a micronutrient was never snapshotted at all, so the choice is today's composition
or nothing.
The missing share is **never scaled up to fill the gap**. It looks like a neutral
estimate and it is a biased one — what goes unmatched is disproportionately
restaurant and packaged food, which differs systematically in micronutrient density
rather than sampling the same diet at random. Extrapolating would turn *I don't
know* into a confident number, which is an **Inconclusive Lookup**'s mistake made
about a whole week.
A lower bound is sound in one direction and not the other, and Tucker says only
what it can. Against an **Upper Level** it holds at any coverage: more data can only
push the figure further over, so *at least 45 mg of zinc against a 40 mg Upper
Level* is a real finding on a barely-matched week. Against the recommended intake it
holds only once the bound already clears it. A bound that falls short is **not a
shortfall** — the unaccounted share could easily hold the rest — so the gap is named
as unknown and never as a deficit, and never as advice about what to eat. Two
figures and a consequence; the user draws the conclusion, exactly as with a
**Check**.
**Full coverage is unreachable, and Tucker says so only once it matters.** An
Estimated Entry has no Food to match, and some manufactured foods have no generic
worth matching them to, so a window has a ceiling below 100% that no amount of
diligence passes. While anything remains matchable the honest message is what is
left to do; once nothing is, the sentence changes to name what remains and why it
will not move. Naming the ceiling earlier would be a second denominator to
understand on every read, in service of a problem that only exists at the end —
and the same distinction an **Inconclusive Lookup** draws: *you can fix this*
against *this will never resolve*.
Where almost nothing is matched, Tucker declines to draw the figures at all and
offers the matching flow instead. That is a judgement about usefulness rather than
honesty — twenty-five near-empty bars mislead no one, they just waste the screen —
and it doubles as the surface that tells a new user what to do. Absent entirely for
a **User** with **Calorie Tracking** off, by the same rule as an Intake Breakdown:
it reads a log Tucker has agreed to stop asking them to keep.
_Avoid_: nutrition profile (Profile is the user's settings), nutrient profile,
deficiency, deficit, RDA score, nutrient gap, micros

**Entry**:
One occurrence of the user eating a Food — a date, a quantity, and the resulting
calories, with protein where it is known. Creating an Entry is what "logging"
means. A mislogged Entry can be
deleted to undo it — in practice only the current day's, so deletion never
rewrites intake a Weekly Review has already counted (a review is irreversible).
_Avoid_: log, record

**Weighed Entry**:
An Entry whose quantity is a mass in grams, measured on a kitchen scale. The
precise, default case. Calories = grams ÷ 100 × the Food's calories-per-100g.

**Estimated Entry**:
An Entry for a meal that can't be weighed or scanned (restaurant, canteen, on the
go) — a name plus an estimated calorie figure, with no Food and no mass. Always
flagged as an estimate so the app can report how much of a day was guessed.
Protein is optional: an Estimated Entry may carry a protein figure or none.
Unknown protein is not zero — a surface that names an Entry omits it rather than
stating a figure the user never gave. A figure that is *known* is always shown,
including one that rounds to `0 g`: that says the food gave almost none, which is
the opposite of saying nothing. A day's protein total counts unknown protein as
zero, since there is nothing else to add.

**Intake Breakdown**:
The share of a window's logged calories attributable to each **Food**, biggest
first — the answer to "what takes up most of my diet?". Defined over two windows,
the user's local day and the trailing seven days, and it is a share of what was
*eaten*, never of the **Calorie Budget**: the question is where the calories went,
not how much of a target they spent, so the same breakdown reads identically on a
day under budget and a day over it. Calories are the measure, because an
**Estimated Entry** has no mass for grams to measure.
One slice per Food, merged across every **Entry** in the window. A **Recipe** is
one slice under its own name, never its ingredients — an Entry snapshots its
calories and a Recipe's definition can be edited afterwards, so attributing a past
Entry through today's ingredient list would report a meal that was never eaten. An
Estimated Entry has no Food, so it slices by its label and is flagged as an
estimate: eating out is a diet item like any other, and how much of the window was
guessed is a separate question (**Daily Log**'s estimated calorie share) that a
single lumped bucket would answer instead of this one.
A breakdown also states how many of the window's days carry an **Entry**: the
width of a window is no evidence that it was logged, so a seven-day breakdown
built from three logged days is discounted rather than read at face value. A day
counts once, however much was logged on it.
Each slice states what it **returned** in protein alongside what it cost in
calories, for the same reason a **Check** does: a slice's size is a fact about the
user's week, not a verdict on the Food, and the biggest item is very often the
protein source. Unknown protein on an Estimated Entry is omitted, not stated as
zero. A slice sums the protein it *knows* about and is omitted only when nothing
in it carried a figure at all: dropping a whole slice's protein because one Entry
in it was guessed would discard something measured, and the alternative — counting
the unknown as zero, as a **Daily Log**'s day total does — would understate a Food
that has a real figure most of the time. A share is never presented as a ranking, a score, or advice about what to
cut — see the no-good-or-bad rule. Absent for a User with **Calorie Tracking**
off — not because their window is reliably empty, which it is not (the setting can
be turned off after a logged breakfast, and a seven-day window survives a week of
it), but because it reads a log Tucker has agreed to stop asking them to keep.
_Avoid_: pie chart, top foods, food ranking, biggest offender, calorie share (a
Check's share is of the Budget — a different denominator)

**Budget Projection**:
A forecast of whether logging a prospective **Entry** would push the day over the
**Calorie Budget** — the over-budget rule applied to the day's intake *plus* one
not-yet-logged Entry. Computed before the Entry is committed, so Tucker can warn
that it would exceed the Budget and by how many calories. The user may log it
anyway: the projection informs the choice, it never blocks it. Defined only while a
Calorie Budget exists, and about calories alone — the **Protein Floor** is a
minimum, not a ceiling, so it has no projection.
_Avoid_: budget check, calorie warning, what-if

**Check**:
A one-off look at a **Food** or **Food Candidate** against the user's **Calorie
Budget** and **Protein Floor**, taken *before* eating or buying it — typically by
scanning a package in a shop. It states what a portion **costs** (its share of the
Budget) and what it **returns** (its share of the Floor), and sets the Food's
protein per 100 kcal against **Pace**. Nothing is created or stored: no Food, no
Entry, no history — the answer is read and discarded. The result is never a label
(see the no-good-or-bad rule below); it is two figures and a consequence.
Distinct from a **Budget Projection**, its sibling: a Projection previews one
not-yet-logged **Entry** against what today has left, so its answer changes
through the day, while a Check weighs a product against the whole day's targets
and so reads the same at 9am and 8pm.
_Avoid_: shelf check, scan, food score, rating, grade

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
steady in between, so it stays a stable habit. A User with **Calorie Tracking**
off has none at all — see **Intake Targets**.
_Avoid_: limit, allowance

**Protein Floor**:
The minimum daily protein intake: 2 g per kg of current Trend Weight, recomputed
at the weekly review. A floor to stay above — the counterpart to the Calorie
Budget's ceiling. Together they protect muscle while losing fat, and together
they are absent for a User with **Calorie Tracking** off (see **Intake
Targets**): a daily minimum is no use to somebody who is not weighing what they
eat.
_Avoid_: protein target, protein goal

**Pace**:
The protein per 100 kcal a day must average to reach the **Protein Floor** inside
the **Calorie Budget** — `Protein Floor ÷ Calorie Budget × 100`. A Food *above*
pace carries its own protein weight; one *below* pace spends calories faster than
it returns protein, so the rest of the day has to make up the difference. Pace is
derived from the user's own two targets and moves with them: a deeper Goal deficit
tightens it (fewer calories, same floor), and **Maintenance Mode** eases it. This
is deliberate — when calories are scarce each one must work harder for protein —
and it has a visible consequence: the same product's figures can change after a
**Weekly Review** moves the Budget, without the product changing. The answer is
that the user's targets moved, not the food, which is why pace is shown. It
describes a Food's relationship to those targets — it is never a verdict on the
Food (see the no-good-or-bad rule). Used by a **Check**.
_Avoid_: protein density (density is mass per volume here — see Recipe and the
per-100ml rule), protein score, food quality, rating

**Maintenance**:
The estimated daily calories that hold the user's weight steady (their TDEE).
Seeded from a standard BMR formula, then corrected each week by an energy
balance: the average daily intake over the **days actually logged** in the
trailing two weeks, plus the energy equivalent of the Trend Weight's change over
that window. Averaging over logged days — not over the whole window — keeps a day
the user didn't log from reading as a zero-calorie day and dragging Maintenance
(and the Calorie Budget) down. The correction is only trusted with enough
coverage: at least 10 of the trailing 14 days must carry an Entry, otherwise the
previous review's Maintenance is held steady — the Budget moves with the trend,
not with logging diligence. The BMR seed applies only when there is no figure to
hold: at cold start, before any review exists, and again on the far side of a
**Calorie Tracking** stretch — where the review before this one carries no
**Intake Targets** and tracking has been off for a week or more. A shorter gap
holds: flipping the setting for a day never moves the Budget. See
[ADR 0018](docs/adr/0018-adaptive-maintenance-averages-over-logged-days.md) and
[ADR 0024](docs/adr/0024-a-weekly-review-carries-intake-targets-only-when-they-can-be-corrected.md).
_Avoid_: TDEE, baseline

**Maintenance Basis**:
How a **Weekly Review**'s **Maintenance** was derived — `FORMULA_SEED` at cold
start, `ADAPTIVE` when corrected from logged intake, or `HELD` when carried
forward below the coverage floor. A structured field (not prose), surfaced to the
user as the review's basis badge — carried inside a review's **Intake Targets**,
so a review run with **Calorie Tracking** off has no basis, because it has no
Maintenance to be the basis of.
_Avoid_: maintenance source, derivation note

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

**Intake Targets**:
The intake half of a **Weekly Review**: the **Maintenance** it was derived from
(with its **Maintenance Basis**), the **Calorie Budget** and the **Protein
Floor**. They arrive and depart as one thing, never in parts — a Floor with no
Budget, or a Budget with no Maintenance behind it, is not a state the domain has.
A review run with **Calorie Tracking** off carries none: the adaptive correction
needs logged intake to correct against, so a Budget derived from an empty log is
one that can never be brought back to the truth. It is therefore *absent* rather
than zero or held. Coming back after a weight-only *stretch* is a cold start —
Maintenance is re-seeded from the formula against the current Trend Weight rather
than carried across the gap, because the body on the far side is not the one the
old figure was computed for. A **toggle** is not a stretch: tracking that returns
within a week of going off carries its old Maintenance forward untouched, so
flipping the setting for a day cannot move the Budget. See
[ADR 0024](docs/adr/0024-a-weekly-review-carries-intake-targets-only-when-they-can-be-corrected.md).
_Avoid_: the budget bundle, calorie settings (a setting is chosen, these are derived)

**Weekly Review**:
The weekly cadence event — and the dated historical record it leaves behind.
Every review records the **Trend Weight**, and for a User with **Calorie
Tracking** off that is the whole of it: a weekly reading of where the body is
and, against a **Goal**, how it is tracking. With Calorie Tracking on the review
*also* runs the adaptive engine, re-deriving Maintenance from the Trend Weight
and logged intake and then the Calorie Budget and Protein Floor for the coming
week — its **Intake Targets**.
Clock-driven reviews are held steady — never changed once written — but a
deliberate **Goal** change (creating or replacing one) and a change of **Calorie
Tracking** each force-recompute today's review, overwriting any same-day record
so the new figures take effect immediately rather than at the next cadence. It is
the _only_ place Maintenance, the Budget, and the Floor are (re)computed; the
Today screen (`/`) shows the latest review's figures. Reviews fire by **lazy catch-up**: on the daily-summary
read that opening Tucker performs — today `/` and a **Check**, not every screen — if
the latest review is a week or more old, the engine runs one review snapping to
today (it does not replay each missed week — the adaptive window already looks
back two weeks). A manual "run now" trigger, a **Goal**-change recompute and a
**Calorie Tracking**-change recompute also exist.
There is no scheduler. Every recompute is stamped on the user's _local_ today —
the client supplies it, the server never substitutes its own wall-clock day (the
"client owns today" boundary rule; see [ADR 0014](docs/adr/0014-client-owns-today.md)
and **Weight Measurement**).
_Avoid_: recalculation, recompute (as a noun)

**Profile**:
A **User**'s personal settings — both the body inputs to the BMR seed (sex, birth
date, height) and the user's locale: their **timezone** (an IANA zone, e.g.
`Europe/Copenhagen`) and weekly-**Reminder** preferences (the local hour to nudge
at, and whether reminders are on) — and whether they are doing **Calorie
Tracking** at all. The body inputs are set once and rarely changed; combined
with the latest Weight Measurement they seed the initial Maintenance estimate.
The timezone is user-level state (one human, one local day),
defaulted from the browser when first captured — it is the proper home for "the
user's local today," which weight-dating approximates client-side today. The
Weekly-**Reminder** engine iterates **Users** and reads each one's Profile to
resolve their local day and their chosen hour.

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
latest review is a week or more old and the user has a **Push Subscription** —
delivered in a short window that opens at the reminder hour (their **Profile**
timezone + chosen hour) and spans the hour after it — so a spring-forward day
whose clocks skip the chosen hour still gets its nudge, while a nudge owed since
morning never arrives at bedtime. Opening Tucker is what ends a Reminder's claim
on the day: a screen that reads the day's summary runs the due review, so a
Reminder is never owed to someone who has opened one — including a **Check**. A
Check computes nothing itself, but *opening* one runs the due review just as the
Today screen does, refreshing the very figures the nudge would have asked them to
come and refresh. Which figures those are depends on the User: a fresh reading of
the **Trend Weight** either way, and the **Intake Targets** as well when
**Calorie Tracking** is on. A **last-seen day**
(the user's local day, never the server clock) is stamped alongside as a second,
redundant guard. At most one Reminder per overdue episode: it is deduped against
the **last Reminder day** — the user's local day the last one went out on,
suppressed while that is after the latest review's date (or, before any review has
run, while any Reminder has gone out at all), and re-armed when opening the app
writes a fresh review whose date moves past it. Both sides of that
comparison are stored days rather than instants, so a later timezone change cannot
move either of them, and "after" allows a day of slack because the two days are read
off different clocks. A displayed nudge, never a guilt-trip. Its *words* follow
**Calorie Tracking** — a tracking user is asked to log today and refresh their
**Calorie Budget**, a weight-only user to log their weight and refresh their trend
— while its firing rule does not: a review comes due on the same cadence either
way. The trigger is absence from the *app*, never from the scale, so a user who
opens Tucker without weighing in is not nudged about the reading they are missing.
_Avoid_: alert, notification, push (as the noun for the user-facing nudge)

**Push Subscription**:
One device's Web Push registration — the browser-issued endpoint and its keys —
that Tucker stores so it can deliver a **Weekly-Review Reminder** to that device
while the app is closed. One per device: a **User**'s phone and laptop are separate
Subscriptions, and their Reminder fans out to all of theirs and to nobody else's.
An endpoint identifies one browser profile on one machine, so it names at most one
Subscription across the whole installation — if two Users ever share a browser,
subscribing hands that device to whoever opted in last, and its Reminders follow
them. Pure transport — it
carries no schedule and no timezone (those belong to the user, on the **Profile**).
Pruned when the browser reports it gone, and equally when its stored keys turn
out not to decode — a device Tucker cannot encrypt to is unreachable for good,
not worth retrying. On iOS a Subscription can only be created once Tucker is
installed to the home screen; on Android and desktop it can be created from the
browser tab.
_Avoid_: device token, push token, registration

## Relationships

- Every **Food**, **Recipe**, **Entry**, **Weight Measurement**, **Goal**,
  **Weekly Review**, **Profile**, and **Push Subscription** belongs to exactly one
  **User**; nothing is shared between Users, and every question Tucker answers is
  asked of one User's data
- Ownership scopes the counting rules too, and each is a rule about a *person*
  rather than about the app: a **User** has at most one **Weight Measurement** per
  day, at most one **Weekly Review** per date, and at most one active **Goal** —
  and two Users may each hold their own on the very same day
- Every **Entry** is either a **Weighed Entry** or an **Estimated Entry**
- A **Weighed Entry** references exactly one **Food** and a mass in grams
- An **Estimated Entry** references no **Food** — it carries its own calorie figure
- A **Food** is referenced by zero or more **Weighed Entries**
- A **Recipe** is a kind of **Food**; its nutrition is the rollup of its ingredient **Foods**
- A day's calories consumed is the sum of calories across that day's **Entries**
- A day's protein consumed is the sum of protein across that day's **Entries**,
  counting an Entry with no protein figure as zero
- The **Calorie Budget** equals **Maintenance** minus the active **Goal**'s deficit,
  or **Maintenance** itself when no Goal is active (**Maintenance Mode**)
- The **Protein Floor** scales from the current **Trend Weight** independent of any
  **Goal**, so it still applies in **Maintenance Mode**
- A **Weekly Review** carries **Intake Targets** only when the **User** has
  **Calorie Tracking** on, and carries all four figures or none: there is no review
  with a **Protein Floor** and no **Calorie Budget**, and none with a **Calorie
  Budget** and no **Maintenance** behind it
- Tucker is **diet-agnostic**: protein is the only macro with a **target**, because
  it is the lever for retaining muscle while losing fat. Carbs and fat are recorded
  (they are needed to derive calories) but never judged, so keto, low-fat, and
  low-carb all track identically. Tucker has no opinion on sugar or saturated fat,
  and sets no target for any nutrient beyond protein and calories
- A **Reference Intake** is not a target, and reporting against one does not breach
  the rule above. A target is adapted, committed to by a **Weekly Review**, and the
  user is held to it; a Reference Intake is a published figure Tucker reads off a
  table, never corrects, and never enforces. **Micronutrient Intake** can therefore
  report vitamins and minerals — sodium included, against its published **Upper
  Level** — without Tucker taking a dietary position. Sugar and saturated fat stay
  out because they are macros, and the rule above already settles Tucker's position
  on those: protein alone
- **No Food is good or bad.** Tucker never labels, grades, or scores a Food — no
  verdict word, no letter, no traffic light. It states what a Food *costs* against
  the **Calorie Budget** and what it *returns* against the **Protein Floor**, and
  the user draws the conclusion. A label is counter-productive as well as
  unearned: it moralises an ingredient when only the **day** has a verdict (see
  the on-target rule below), and a food that reads badly alone is fine paired with
  something protein-dense
- A **Goal** and the current **Trend Weight** yield **Goal Progress** — how far the
  trend has moved toward the target and when, at the Goal's rate, it's projected to arrive
- **Maintenance** is corrected over time from **Entries** and the **Trend Weight**
- A day is **on-target** once the **Protein Floor** is met and intake is at or under the **Calorie Budget**; it is **over budget** the moment intake exceeds the **Calorie Budget**. An in-progress day in neither state has no verdict — being under the floor mid-day isn't a failure, the day just isn't finished.
- A **Budget Projection** applies the over-budget rule to the day's intake plus a prospective **Entry**, warning before it's logged; the user may log it regardless
- A **Check** weighs a **Food** or **Food Candidate** against the whole day's
  **Calorie Budget** and **Protein Floor** — never against what's left — so the
  same product reads the same at any hour. It creates nothing and is defined only
  while a Calorie Budget exists
- **Pace** is `Protein Floor ÷ Calorie Budget × 100`; a **Food**'s protein per
  100 kcal sits above or below it
- An **Inconclusive Lookup** is never presented as a miss and is never silent.
  Tucker says it could not find out, rather than implying the product is unknown —
  guessing which of the two happened is exactly what the user cannot do, and the
  wrong guess costs them a permanently hand-entered **Food**
- A **Weekly-Review Reminder** is sent when a **Weekly Review** is overdue and the
  user has at least one **Push Subscription** — it nudges, it never computes the review
- A user has zero or more **Push Subscriptions** (one per device); each **Weekly-Review
  Reminder** fans out to all of them, in a short window opening at the hour set on
  the user's **Profile**

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
- A shared catalog — this glossary once promised that a barcode-scanned **Food** was
  global product data, one row per barcode shared by every user, with a correction
  *forking* a private copy. Resolved against: every Food is private to its owner, the
  same barcode may exist once per **User**, and the dedupe benefit comes from the shared
  per-barcode *lookup* cache instead. The reversal and its reasons are recorded in
  [ADR 0021](docs/adr/0021-every-row-is-owned-by-one-user.md); sharing a **Recipe** with
  another User remains a deliberate future feature.
- Liquids vs solids — resolved: everything is weighed in grams, liquids included.
  A scanned drink published per 100 ml is treated as per-100g — Tucker assumes
  water density (1 g/ml) rather than a per-product density. A small, accepted
  inaccuracy for denser drinks, which the user can correct at Food Candidate
  confirmation (where the Provider's stated energy is shown as a cross-check).
