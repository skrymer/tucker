# Micronutrients are borrowed, bounded, and never a target

Tucker tracks calories and protein. A user asked for the other half of nutrition —
which vitamins and minerals their diet actually supplies — so they can change what
they eat. Three things stood in the way, and each was settled in a design
interview; the decisions below are the result.

The domain terms this introduces (**Reference Intake**, **Reference Food**,
**Micronutrient Intake**) live in [`CONTEXT.md`](../../CONTEXT.md), alongside the
amended **diet-agnostic** rule.

## A Reference Intake is not a target, and that is what lets Tucker carry one

`CONTEXT.md` has always said Tucker is **diet-agnostic**: protein is the only macro
with a target, and Tucker "has no opinion on sugar, saturated fat, or any nutrient
it sets no target for". Taken at face value that forbids this feature outright —
"you are low in iron" is a target for a nutrient, and it is advice.

The rule survives because **target** was doing two jobs. A target is something
Tucker **adapts** and a **Weekly Review** commits to; the user is held to it, and
the adaptive engine corrects it week by week ([0018](0018-adaptive-maintenance-averages-over-logged-days.md),
[0024](0024-a-weekly-review-carries-intake-targets-only-when-they-can-be-corrected.md)).
A **Reference Intake** is a published figure read off a table, never corrected,
never enforced, and never carried by a review. Splitting the two lets Tucker report
against iron without acquiring an opinion about diets: keto and low-fat still track
identically, because the iron line is the same number under both.

The line is drawn at macros, not at "nutrients we happen to have data for". Sugar
and saturated fat stay out because they are macros, and the rule above already
settles Tucker's position on macros: protein alone. **Dietary fibre is in**, and it
is the one member of the set that is not a micronutrient. It is admitted on the test
sodium passes below, not on the fact that AFCD reports it alongside the others: the
NHMRC publishes a reference for it, it is read against a *window* and never against
a Food, and Tucker sets no target for it — so it stays a **Reference Intake** rather
than becoming an opinion about a diet. **Sodium is in**, and it is the
hardest case — it is the one nutrient here a reasonable reader will call a dietary
position. It earns its place because the line Tucker reads it against is a published
figure rather than a diet opinion, and because it is read against a *window* and
never against a Food, which keeps [0022](0022-a-check-states-cost-and-return-and-never-labels-a-food.md)'s
no-good-or-bad rule intact.

**That line is not an Upper Level, which this ADR originally said it was.** The 2017
NHMRC revision **withdrew** sodium's adult UL outright — an adult's now reads *not
determined*, because the review found a linear dose-response with no breakpoint
anywhere in 1,200–3,300 mg/day to hang one on — and set a **Suggested Dietary
Target** of 2,000 mg/day in its place. Sodium's other published figure is an
*Adequate Intake* expressed as a **range** (460–920 mg/day), which is nothing to
reach: clearing the bottom of a range is not a finding worth publishing. So sodium
carries a line not to cross and nothing to reach, and that line is an SDT.

An SDT is a population chronic-disease target rather than a threshold where harm
begins, so it is **carried as what it is**: a `nutrient_reference_value` row records
the *kind* of line beside the amount, and sodium's tile reads *Suggested target
2,000 mg* where every other reads *Upper Level*. Storing it in an Upper Level column
was the cheap option and is exactly the substitution the paragraph above exists to
refuse — it would have Tucker telling a User that a dietary target is where harm
begins. The claim is therefore named **over the limit** rather than over the Upper
Level, because two different published figures now reach it.

**Protein is excluded**, deliberately and against the grain. It is the one nutrient
Tucker already has a figure for — and the **Protein Floor** is set from body weight
at 2.0 g/kg, while the published reference is a quite different and much lower
number. Two protein lines on one screen is Tucker contradicting itself about the
one macro it targets.

### The source is Australian, and it is read live

Every **User** is in Australia — an operator promise, since the Cloudflare Access
policy is the admission list ([0020](0020-identity-comes-from-cloudflare-access.md)) —
so there is **one** reference set and no per-user or per-jurisdiction resolution:
the **Nutrient Reference Values** for Australia and New Zealand (NHMRC, 2006,
sodium and fluoride revised 2017, CC BY 4.0). The recommended intake is the line to
reach and the **Upper Level** is the line not to cross — except for sodium, whose
line is a Suggested Dietary Target, for the reason above. A flat label `%DV` was
rejected: `Profile` already carries sex and birth date, and one number for everyone
is wrong by 60% on iron between a 25-year-old man and a 55-year-old woman.

**A nutrient carries a line only where one can be read against food that was
eaten**, and ten of the nineteen carry none. Five have no Upper Level published
at all (fibre, thiamin, riboflavin, B12, and vitamin C — for which NHMRC states one
*cannot* be established and names 1,000 mg only as a prudent limit). Two publish one
for a different route into the body: magnesium's 350 mg is *as a supplement*, and
potassium's is explicitly not set for dietary sources. Three publish one for a
**different substance than AFCD reports** — vitamin A's 3,000 µg is preformed
retinol against AFCD's retinol *equivalents*, niacin's 35 mg is nicotinic acid from
fortified food against AFCD's niacin *derived equivalents*, and folate's 1,000 µg is
folic acid against AFCD's *dietary folate equivalents*. Reading one against the other
would put a carotene-rich week over a threshold it is nowhere near, and the
over-the-limit claim is the one Tucker makes at **any** coverage — so a wrong line
there is worse than none. Each absence is recorded per nutrient in `V18`.

The bands are seeded **from age 14**, NHMRC's own adolescent band and below any
plausible User of a weight-loss tracker. Below it nothing resolves and a nutrient
with no Reference Intake earns no claim, rather than being read against an adult line
that is not its own. The bands are also **ragged, because NHMRC's are**: sodium's open
at 14 and 18 where every other nutrient's open at 14, 19, 31, 51 and 71.

The reference is **read live**, never snapshotted, and a revision reaches windows
that predate it. This deviates from Tucker's usual rule — a derived figure records
the basis it was derived from ([0024](0024-a-weekly-review-carries-intake-targets-only-when-they-can-be-corrected.md);
an Entry snapshots its calories) — and the deviation is the point. A **Calorie
Budget** from a past week is a *commitment the user was held to*, worth preserving
even when it later looks wrong. A Reference Intake is a measuring stick for a body
*now*: if the science was revised, the old reading was simply wrong. The same
mechanism handles the far more frequent event — a user having a birthday and
crossing a band — for free. The band is resolved **once, at the window's end date**,
so a window spanning a birthday has one answer.

A revision ships as a **new Flyway migration and a pull request**, never a scheduled
download. A few hundred rows that move twice a career do not earn refresh
infrastructure, and a silent overnight change to what Tucker tells someone about
their iron should be read by a human first. The **edition in force is named wherever
the figures appear**, or the user has no way to see that the line moved.

**Pregnancy and lactation are out of scope.** They shift several figures
substantially (iron 18→27 mg, folate 400→600 µg) and Tucker has no field for either.
The assumption is stated where the figures are read rather than guessed at; a health
status field on a profile that is otherwise about weight, silently going stale, is
worse than an honest caveat.

## No Australian barcode carries a micronutrient, so a Food borrows one

This is a fact about labelling law, not about any data source. Australian labels
declare energy, protein, fat, saturated fat, carbohydrate, sugars and sodium, and
nothing else unless it is claimed or fortified. So **Open Food Facts** gives sodium
and holes, and so does every alternative:

- The **Australian Branded Food Database** (FSANZ) looks like the answer — it is
  official, Australian, and its products carry barcodes — and it is not. It holds
  the same 7 mandatory nutrients plus fibre, added sugars, wholegrain % and FVNL
  content, so it carries no micronutrients either. It is also not publicly
  available: portal search only, no bulk download, no API, and automated scripts
  prohibited without written consent. Recorded here because it is the first thing
  a future reader will suggest.
- **USDA FoodData Central**'s branded set carries four (vitamin D, calcium, iron,
  potassium — mandatory on US labels since 2016), on US products, for Australian
  shoppers. Four of twenty, from the wrong shelf.

The **Australian Food Composition Database** (AFCD, FSANZ) is the mirror image:
rich micronutrient detail on *generic* foods, and no barcodes at all. It is
therefore a **`TEXT_SEARCH` Provider**, the capability
[0006](0006-provider-agnostic-nutrition-lookup.md) defined and left a seam for. The
barcode chain is unchanged.

**This was measured before it was committed to**, against Release 3 (23 December
2025) — a design spike, because a feature whose data source does not normalise is
not worth slicing. The findings:

- **1,588 foods, 272 columns**, plain `.xlsx` that the JVM (or `zipfile` +
  `ElementTree`, as the spike used) reads with no new dependency. Units are in the
  header — `Iron (Fe) (mg)`, `Cobalamin (B12) (ug)`.
- **All 19 curated nutrients are populated for all 1,588 foods. 100%, no holes.**
  A raw row looks sparse — 75 of 272 columns — but the emptiness is entirely in the
  exotic tail (individual fatty acids and the like). Our set is AFCD's guaranteed
  core, and that fact is what makes a **fallback source unnecessary** (below).

### The link is a pointer, not a copy

A **Food** may be **matched** to a **Reference Food** and then borrows its
micronutrient profile. The Food keeps its own four macros — weighed, corrected, and
driving the deterministic core — and only the vitamins and minerals come from the
match, scaled by the **grams eaten**. Scaling by grams rather than by calories or
protein is what stops the inevitable disagreement between the two sources
compounding: the Food says 23 g protein per 100 g and the generic says 21.9, and
neither figure is used to scale the other.

Copying the micronutrients into the Food at creation — which is what
[0006](0006-provider-agnostic-nutrition-lookup.md) does for macros — was rejected:

- **It misdescribes the data.** Nobody will ever hand-correct twenty micronutrient
  values. A borrowed generic profile is an estimate by analogy — *this is roughly
  chicken breast* — and a link says so where a copy pretends the figures were
  measured for this product.
- **It forces one source to serve both jobs.** Under a link, a scanned Coles chicken
  breast keeps the label's macros *and* gains a plausible micronutrient profile.
- **It leaves existing catalogs stranded.** Every Food already in every catalog has
  no micronutrients; under a copy the only route is re-creating each one, discarding
  its barcode and its corrected macros.
- **It would need twenty-odd columns on `food`**, per user, mostly null.

`reference_food` is therefore a **global, unowned table**, which
[0021](0021-every-row-is-owned-by-one-user.md) already permits alongside
`app_config`; `food.reference_food_id` is the owned row pointing out. It is seeded
by Flyway as a **wide table of the ~20 curated nutrients**, not all 268: an EAV
table would be ~425k inserts that `prepareJooqDatabase` parses one statement at a
time on every build, and a 268-column table generates a jOOQ record nobody will
touch.

### A match is a claim a human makes

Tucker suggests a Reference Food by name and the user taps to accept. **Nothing is
matched silently, and no migration guesses.** `"Chicken"` hits some forty AFCD
entries and raw against roasted against skin-on moves iron and zinc materially, so
a name-similarity auto-match would produce confident figures for food that was
never eaten — invisibly, since the user never saw it happen. That also keeps the
migration precedent [0021](0021-every-row-is-owned-by-one-user.md) set: V11–V13
adopt unowned rows only under a one-User guard and **refuse rather than guess** when
attribution is ambiguous.

A match is **reversible**, for the same reason: a wrong match is worse than none.

### The search is the product, and it needs three specific things

The spike's second half measured whether a user's own words find the right AFCD
entry, and the first answer was no: naive tokenising landed **5 of 15** realistic
queries. `Almonds` returned *nothing* (AFCD says `Nut, almond`), and — the dangerous
one — `Free-range eggs` returned **`Bread, gluten free`**, because *free* matched.
A confidently wrong top hit, not a miss, is this feature's characteristic failure.

Three fixes took it to **16 of 19 top-1, 18 of 19 top-3**, and all three live in
SQLite:

1. **Head-noun boosting.** AFCD names are `Head, qualifier, qualifier, state`, so the
   head *is* the food. Indexing it as its own FTS5 column and ranking
   `bm25(f, 10.0, 1.0)` is the single biggest win — it alone fixes the eggs case,
   because *free* appears only in the other column.
2. **A synonym map of Australian retail vernacular.** The failures are systematic,
   not random: AFCD writes `Milk, cow, fluid, regular fat`, `Cheese, cheddar`,
   `Yoghurt, natural` where a shopper writes *full cream*, *tasty*, *Greek*. Eleven
   rewrites fixed every one of them — `tasty`, `greek`, `full cream`, `jasmine`,
   `basmati`, `tinned`, `free range`, `lite`, `chook`, `roo`, `avo`. It is **seeded
   with exactly those and grown only on observed failure** — a curated list is real ongoing debt, and one that grows
   speculatively grows without bound, but the difference between `Tasty cheese`
   working and not is most of a first impression.
3. **Porter stemming** (`tokenize='porter unicode61'`), without which plurals return
   nothing at all.

**A dedicated search engine was considered and rejected.** Elasticsearch runs the
same BM25; the three fixes above are a field weight, a synonym filter and a stemmer,
which it packages more ergonomically and FTS5 already has. Out of the box it makes
**every one of the original mistakes**, because these are vocabulary problems rather
than ranking problems. Against that it wants 2–4 GB of heap on a **1 vCPU / 2 GB**
node that [0015](0015-production-deployment-topology.md) records already OOM-killing
a *Vite build*, and it is a second datastore with its own backup story next to a
Litestream-replicated SQLite file. For 1,588 rows.

**A suggestion is withheld rather than guessed at.** Ranking first is not the same
as being right, so Tucker offers the top hit for a tap only when the query accounted
for every word of that candidate's *head*. `cheddar cheese` names the whole of the
head `Cheese` and is offered; `almond` names half of `Almond beverage`, which is a
different food that merely starts with the word asked for, so nothing is offered and
the picker says so and leaves the candidates listed. Withholding costs one tap on a
listed candidate; guessing costs a week of figures for food that was never eaten,
invisibly — the same asymmetry that makes a match a claim a human makes.

That rule turns the first of two residuals from a wrong answer into no answer:
`Almonds` still *ranks* **Almond beverage** above the nut, because head-boosting
backfires on a compound head that starts with the query word, and the ranking is
unfixed. What it no longer does is offer it. The rule does **not** reach a head
**shared** by many foods — a bare `Chicken` names the whole of forty-two heads, and
one of them is offered arbitrarily. A confidence rule with a real signal behind it
has to be re-measured against the whole spike query set before it lands, so that is
tracked rather than guessed at here.

The second residual is accepted outright: **`sourdough` returns zero rows in all
1,588 foods** — AFCD is generic staples, not a retail catalogue, which is the
coverage ceiling above, confirmed empirically rather than assumed.

**A candidate carries figures, and they are chosen for the set rather than for the
candidate.** Forty near-identical names give a user nothing to choose between, so
each row also states the three nutrients that most *separate the candidates on
offer* — measured as how many of them a column tells apart, because AFCD reports a
real zero constantly and a column of them separates one row while leaving the rest
identical. Chosen for the result set so the list reads down a column, and shown as a
text subline rather than a stat-sized tile: these describe a **Reference Food** a
user is choosing between, never their own **Food**, which is what keeps the per-Food
micronutrient screen out of scope.

The obvious objection is the tap count — a user with sixty Foods facing sixty taps
does none of them. That is solved by **ordering, not automation**. The match queue
is the **Intake Breakdown** filtered to the unmatched: same denominator, same
ranking, already built ([0026](0026-an-intake-breakdown-divides-what-was-eaten-never-the-budget.md)).
Diets are repetitive, so five taps is most of a week — measured at 21% → 76%
coverage on a plausible seven-day log. There is **one** entry point, the queue; a
match step in Add-Food was considered and cut, because a newly-created Food that
gets eaten appears in the queue by itself, ranked by its share, so the step would
touch the hot path to solve a backlog that does not exist.

### There is no fallback source, and that is not an oversight

[0006](0006-provider-agnostic-nutrition-lookup.md) establishes an **ordered
fallback chain** for barcode lookups, so the absence of one here will read as
something forgotten. It is not, and the chain's reasoning does not carry over.

A fallback fills holes and **AFCD has none** — 100% on every curated nutrient. What
AFCD lacks is *breadth of foods*, and USDA's generic sets would genuinely add some
(`sourdough` among them). It is still refused:

- **The two databases do not measure the same things.** AFCD reports `Niacin derived
  equivalents`, which includes tryptophan conversion (it ships the tryptophan
  contribution as a separate column); USDA reports preformed niacin. AFCD reports
  `Vitamin A retinol equivalents` (RE); USDA reports RAE, whose carotenoid conversion
  differs by roughly a factor of two on plant sources. AFCD reports `Vitamin D3
  equivalents`, weighting 25-OH-D3. A mixed week's figure would be a sum of
  incompatible measurements with nothing on the wire saying which row came from
  where.
- **Iodine and selenium are soil-dependent**, and Australian soils are iodine-poor —
  which is why iodised salt has been mandatory in Australian bread since 2009. A US
  value for those is not a rougher estimate of an Australian food; it is a
  measurement of a different food system. The **Reference Intake** is Australian too,
  so the mismatch compounds.
- **Nothing would catch it.** A barcode fallback is safe because it produces a **Food
  Candidate** a human confirms against a stated-energy cross-check. A Reference
  Food's *link* is confirmed by a human; its nineteen numbers are not, and never will
  be.

The decisive point is the lower bound. Because a shortfall is never claimed, an
absent food costs Tucker **only coverage** — a smaller denominator, honestly stated
— while a wrong food costs it **correctness**, silently and permanently. A fallback
here trades a known absence for an unknown error, which is the same trade the
never-extrapolate rule already refuses. USDA remains right for the *barcode* chain
and macros, as 0006 says.

### A Recipe is never matched, it rolls up

A **Recipe**'s composition is already known, so rolling its micronutrients up from
whichever ingredients are matched — each weighed as added, re-expressed over the
cooked weight ([0019](0019-recipe-density-is-a-representative-batch-estimate.md)) —
always beats matching the finished dish to a generic prepared one. A partly-matched
Recipe contributes partly, and its calories count fractionally toward coverage;
all-or-none would discard something measured.

**This amends [0026](0026-an-intake-breakdown-divides-what-was-eaten-never-the-budget.md)**,
which rules that a Recipe is one slice under its own name, never its ingredients,
because "attributing a past Entry through today's ingredient list would report a
meal that was never eaten". Rolling a past Recipe Entry up through today's
ingredients is literally that — and the rule does not reach here, because it
protects a **snapshot** from being contradicted. An Entry snapshotted its calories,
so re-deriving them from today's recipe would make the slices disagree with the
day's logged total. A micronutrient was never snapshotted at all, so the choice is
not *recorded figure against today's recipe* but *today's recipe against nothing*.
It is also the same live-borrowing already accepted everywhere else here, over a
seven-day window inside which recipe drift is small.

## Every figure is a lower bound, and a bound that falls short is not a shortfall

Coverage is structurally poor and always will be. An **Estimated Entry** has no Food
so can never contribute; an unmatched Food contributes nothing; some manufactured
foods have no generic worth matching to. So the summed figure is *at least* what was
eaten, and **the share of the window's calories that could contribute is stated
alongside it, always**. Calories measure that share for
[0026](0026-an-intake-breakdown-divides-what-was-eaten-never-the-budget.md)'s reason:
an Estimated Entry has no mass, so grams cannot measure the entries most likely to be
missing.

**The missing share is never scaled up.** Extrapolating the known portion to 100%
reads as a neutral estimate and is a biased one — what goes unmatched is
disproportionately restaurant and packaged food, systematically different in
micronutrient density rather than a random sample of the same diet. It also turns
*I don't know* into a confident number, which is an **Inconclusive Lookup**'s mistake
made about a whole week.

A lower bound is sound in one direction only, and that asymmetry replaces the
arbitrary coverage threshold this feature would otherwise need:

- Against the **line not to cross** it holds at **any** coverage — more data can only
  push the figure further over. *At least 45 mg of zinc against a 40 mg Upper Level*
  is a real finding on a barely-matched week.
- Against the recommended intake it holds only **once the bound already clears it**.
  A bound that falls short is not a shortfall; the unaccounted share could hold the
  rest. The gap is named as unknown, never as a deficit, and never as advice about
  what to cut.

The consequence is worth stating plainly: **the shortfall direction — the thing the
original request asked for — is the weakest claim Tucker can make**, and it only
strengthens as the user matches more. The Upper Level direction works from the first
match. That is an argument for making the queue prominent, not for softening the
rule.

**A shortfall is not published, so it is not drawn either.** A group whose every row
says "not enough matched to say" is rendered as **names without figures**: a
`≥ 2.0 µg of 5.0 µg` set in a stat-sized tile *is* a deficiency readout whatever the
caption says. Structure carries the epistemic split — a tile means Tucker can state
this, a name in a list means it cannot.

**Where nothing at all can be stated, nothing is drawn.** The rule is *no claim
survives*, not *coverage is below N%*: a threshold would be a second arbitrary number
in a feature whose whole design avoids one, and — worse — it would suppress the
over-the-limit finding that the paragraph above says holds at any coverage. Falling
out of the claims rather than being gated ahead of them means a barely-matched week
with 45 mg of zinc in it still draws that tile, while a barely-matched week with
nothing in it draws no figures and offers the queue instead. Nineteen names under
"not enough matched to say" is the whole set, which wastes the screen without
misleading anybody — a judgement about usefulness rather than about honesty, and it
doubles as the surface that tells a new user what to do.

**The claim also states how much of its window was logged**, the discount
[0026](0026-an-intake-breakdown-divides-what-was-eaten-never-the-budget.md) requires
of a windowed read. Coverage is a ratio of logged calories to logged calories and so
is scale-invariant in how many days were logged — but the *sentence* makes a claim
about the last seven days, not about the calories in them, and that claim is exactly
as strong as the log behind it. `3 of 7 days logged` is the same caption an Intake
Breakdown carries, beside figures that matter more.

**Seven days is enforced, not assumed.** `CONTEXT.md` states the window as an
invariant and until #284 nothing checked it: the endpoint took arbitrary bounds, the
seven came from one client call site, and the number then lived in hardcoded English.
`MicronutrientIntake.of` now refuses any other span — the move
`IntakeBreakdown.of` already makes in refusing an Entry outside its window rather
than filtering it away — and the card measures every day count off the response's own
bounds, so the copy cannot drift from the rule.

**Full coverage is unreachable**, and Tucker says so only once it matters: while
anything remains matchable the honest message is what is left to do, and once nothing
is, the sentence names what remains and why it will never move. Showing the ceiling
earlier is a second denominator to understand on every read, for a problem that only
exists at the end — the same *you can fix this* against *this will never resolve*
distinction an **Inconclusive Lookup** draws.

## Consequences

- **Backend:** a global `reference_food` table (~20 curated nutrients, wide),
  Flyway-seeded from the AFCD release; a nullable `food.reference_food_id`; an AFCD
  `NutritionProvider` declaring `TEXT_SEARCH` only, so it never joins a barcode scan;
  an FTS5 index over a head/rest split of the name with porter stemming, plus a
  seeded synonym table, behind `GET /api/reference-foods?q=`;
  a `nutrient_reference_value` table keyed by nutrient, sex and the age its band
  opens at, carrying the recommended figure and the line not to cross with the kind
  of figure that line is; a windowed **Micronutrient Intake** read returning
  per-nutrient lower bounds, the figures each was read against, one of three claims,
  the coverage share and the logged-day count, plus the ranked unmatched Foods.
  Nothing is stored per window — it is a read, like an Intake Breakdown.
- **Frontend:** one section on `/review` below the Intake Breakdown, with the match
  queue folded inside it rather than as a peer card; a searchable Reference Food
  picker in the existing `ResponsiveOverlay`; a match subline on `FoodListItem`
  naming what a Food is matched *to* — never a bare tick, which is unverifiable, and
  never a marker on the unmatched, which would decorate a Food with a status it did
  not earn.
- **No Profile setting.** The feature is self-silencing: an uninterested user sees no
  match sublines and one section that says what it is for. F12's setting existed
  because Tucker was *permanently wrong* at weight-only users; this is not that.
- **Absent with Calorie Tracking off**, by the same rule as an Intake Breakdown — it
  reads a log Tucker has agreed to stop asking for.
- **Licensing is a live obligation, not a footnote.** AFCD is **CC BY-SA 3.0 AU** —
  share-alike, and an ingested re-schema'd copy is plausibly a derivative — and
  mandates the Limitation of Data Statement and a "based on Australian data" notice
  on every distribution. Commercial use is permitted. NRVs are CC BY 4.0, attributed
  `Source: National Health and Medical Research Council`. Tucker already carries an
  obligation of this shape for Open Food Facts (ODbL). This is an input to
  [#166](https://github.com/skrymer/tucker/issues/166).
- **Deliberately out of scope:** any LLM in this path. The deterministic core rule
  stands, and `CLAUDE.md` carves out an LLM only as an *input* adapter for free-text
  meal parsing. Handing a user's diet log and nutrient profile to a third party for
  analysis is an *output* adapter, a separate decision, and one with a privacy
  dimension an invite-only private app should not settle in passing. Storing the
  nutrients as structured data leaves the door open without walking through it.
- Also out of scope: grading or scoring a Food on its micronutrients, a per-Food
  micronutrient screen, any window other than the trailing seven days, and a
  micronutrient figure inside a **Check**.

## References

- [0006 — provider-agnostic nutrition lookup](0006-provider-agnostic-nutrition-lookup.md)
  — the `TEXT_SEARCH` capability this uses, and the copy-at-creation rule for macros
  that this deviates from for micronutrients.
- [0021 — every row is owned by one User](0021-every-row-is-owned-by-one-user.md) —
  why `reference_food` may be global, and the migrations-do-not-guess precedent.
- [0022 — a Check states cost and return and never labels a Food](0022-a-check-states-cost-and-return-and-never-labels-a-food.md)
  — the no-good-or-bad rule this stays inside.
- [0024 — a Weekly Review carries intake targets only when they can be corrected](0024-a-weekly-review-carries-intake-targets-only-when-they-can-be-corrected.md)
  — what a **target** means, which is what a Reference Intake is not.
- [0026 — an Intake Breakdown divides what was eaten](0026-an-intake-breakdown-divides-what-was-eaten-never-the-budget.md)
  — amended above for Recipe attribution; also the ranking the match queue reuses.
- [`CONTEXT.md`](../../CONTEXT.md) — `Reference Food`, `Reference Intake`,
  `Micronutrient Intake`, and the amended diet-agnostic rule.
- Australian Food Composition Database (FSANZ), Release 3.0 — data files and the
  CC BY-SA 3.0 AU user licence:
  <https://www.foodstandards.gov.au/science-data/food-nutrient-databases/afcd>
- Nutrient Reference Values for Australia and New Zealand (NHMRC):
  <https://www.nhmrc.gov.au/about-us/publications/nutrient-reference-values-australia-and-new-zealand-including-recommended-dietary-intakes>
- Australian Branded Food Database (FSANZ) — assessed and rejected above:
  <https://www.foodstandards.gov.au/science-data/food-nutrient-databases/branded-food-database>
