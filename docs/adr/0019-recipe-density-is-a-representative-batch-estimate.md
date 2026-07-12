# A Recipe's density is a representative-batch estimate, not re-measured per batch

A **Recipe**'s cooked weight — and therefore its per-100 g density — is recorded
**once**, as a representative batch. It is **not** re-measured each time the dish
is cooked, and a portion is never asked for that batch's own finished weight at
log time. When the estimate drifts, the user **edits the Recipe** to recalibrate.

*Status: accepted; part of F9 Recipes ([#141](https://github.com/skrymer/tucker/issues/141)).*

## Context

A Recipe rolls its weighed ingredients into a single per-100 g figure by dividing
the batch total by the finished **cooked weight** (`per-100 g = total ÷ cooked
weight`, CONTEXT.md). Cooking only moves water — no calories or protein — so the
total is conserved and the cooked weight is purely how a portion is *sliced out*
of that total.

But the cooked weight is not a constant. Cook the same recipe ten minutes longer
another day and it loses more water: the real density shifts a little, batch to
batch. A model has to decide whose measurement of "cooked weight" a logged
portion is divided by.

The honest-but-heavy answer is to capture the finished weight of **every** batch
at log time — weigh the pot each cook, and divide that day's portion by that
day's density. The cheap answer is to record one representative cooked weight and
reuse it. The tension is accuracy versus friction, and it is sharpened by a hard
constraint already in the domain: **Entries snapshot** their calories and protein
at log time (see `WeighedEntry.log`) and are permanent history. Whatever the
Recipe model is, it must never rewrite a past log.

## Decision

Record the cooked weight **once**, as a representative batch, and treat the
resulting density as a bounded estimate. Do not capture per-batch cooked weight at
log time; logging a Recipe is identical to logging any other Food — weigh your
portion, done.

The drift this admits is small and bounded: it never touches the batch *total*
(which is real, from weighed ingredients), only how a portion is divided out of
it, and it sits below the estimation error already living in any Food's per-100 g
— the same way a supermarket ready-meal's label is a batch average, not a
measurement of the packet in your hand.

When the representative estimate is wrong enough to matter, the **escape hatch is
editing the Recipe** (`PUT /api/recipes/{id}`): change the ingredients or
re-enter the cooked weight, and the stored per-100 g re-rolls. Editing updates the
Recipe **in place, keeping the same Food id**, so logged Entries still resolve and
the catalog entry is stable. Because Entries snapshot at log time, recalibrating
changes only **future** logs — past logs keep the density they were logged under.
That one-way property is exactly what makes a representative-batch estimate
livable: a wrong guess is never destructive, only correctable going forward.

The edit form **is the create builder, pre-filled** with the Recipe's name,
ingredient lines, and cooked weight — recalibration reuses the same interactions
as building, so there is nothing new to learn.

## Considered and rejected

- **Per-batch cooked-weight capture at log time** — ask for the finished weight of
  *this* batch every time a portion is logged, and divide by that. Maximally
  accurate, but it taxes the most common action (logging a portion) with a
  measurement the user often can't make — you weigh a serving from a dish already
  plated, or from leftovers reheated days later, with no memory of the whole
  batch's weight. It also complicates the snapshot story (which batch's density is
  "the" density?) for accuracy well inside the noise floor of macro estimation.
- **Immutable Recipes, correct by re-creating** — forbid editing; a bad estimate
  means making a new Recipe and deleting the old. But a Recipe **cannot be
  deleted** once referenced by an Entry or used as an ingredient (CONTEXT.md), so
  the old one lingers in the catalog forever, and every past log points at a Food
  whose name now reads as stale. In-place edit keeps one honest catalog entry.
- **Editing rewrites history** — recompute past Entries from the new density so the
  Recipe is always internally consistent. Rejected outright: Entries are permanent
  history and a Weekly Review is irreversible; silently re-deriving logged days
  would corrupt the adaptive engine's inputs. The snapshot is the invariant, not a
  cache.

## Consequences

- A new **`PUT /api/recipes/{id}`** updates a Recipe in place — re-rolls its
  per-100 g and **replaces** its ingredient lines — backed by a new
  `RecipeRepository.update` (and `FoodRepository.update`). `GET /api/recipes/{id}`
  (Slice 2) is reused to load the edit form.
- The edit UI is the recipe builder seeded from the fetched composition, reached
  from the read-only composition view; its Save reads **"Save changes."** The
  recorded cooked weight opens as a final value, not the raw-ingredient-sum
  estimate the create flow starts from.
- No schema migration: a Recipe is still a Food row (`kind = RECIPE`) plus its
  ingredient rows; update overwrites both.
- Reinforces [0002](0002-business-logic-belongs-in-the-backend.md) — the re-roll is
  the backend's; the client only presents a live preview. The
  representative-batch definition and the "editing recalibrates, snapshots protect
  history" rule already live in [`CONTEXT.md`](../../CONTEXT.md) (Recipe); this ADR
  records *why* that model was chosen over per-batch measurement.

## References

- [`CONTEXT.md`](../../CONTEXT.md) — `Recipe` (representative batch, cooked weight,
  editing to recalibrate), `Entry` (calories snapshotted at log time), `Food`
  (a referenced Food cannot be deleted).
- [0001 — Domain-Driven Design](0001-domain-driven-design.md) — behaviour and
  invariants live in the domain (`Recipe.nutrition`, `WeighedEntry.log`).
- [0002 — business logic belongs in the backend](0002-business-logic-belongs-in-the-backend.md)
  — the rollup and re-roll are computed server-side.
- [#141](https://github.com/skrymer/tucker/issues/141) — F9 Recipes PRD;
  [#144](https://github.com/skrymer/tucker/issues/144) — the Edit-a-Recipe slice
  this decision lands with.
