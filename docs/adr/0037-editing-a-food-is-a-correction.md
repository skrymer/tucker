# Editing a Food is a correction

A Food's name, macros and Tags can now be edited, and an edit means **the old values
were never true**. It does not mean the product changed. That one reading decides
what the edit reaches. Everything that reads the Food *now* sees the new values,
including every **Recipe** that uses it as an ingredient, which is recalculated in
the same transaction. What was already **logged** keeps its figures: an **Entry**
snapshots its calories and protein, and a correction does not reach them. An Entry
does not snapshot its Food's *name*, so a corrected name does reach past Entries,
because the old spelling was never true either. A reformulated product is added as
a new Food.

## Considered options

- **An edit is a new version.** The old values stay attached to everything that
  already used them, and only new uses see the new ones. Rejected because the edit
  people actually make is fixing a mistake: a typo, protein entered as 31 instead
  of 13, or Open Food Facts' wrong macros. Under versioning a fix would leave every
  Recipe built on the mistake still wrong. Reformulations are rare, and adding a
  new Food covers them.
- **Recalculate Recipe nutrition on every read** instead of updating it on save.
  This would never go stale, but every read of the catalog, Frequent Foods, Check
  and the Intake Breakdown would pay for the join. Recipes already store their
  figures when they're saved (ADR 0019), so recalculating on correction is one more
  save-time effect, not a new model.
- **Snapshot the Food's name on the Entry as well.** This would need a migration
  and a backfill, and would keep a misspelling in last week's Intake Breakdown
  permanently. The snapshot rule protects the numbers history was built on. A name
  is not one of those numbers.

## Consequences

- **Recalculating a Recipe overwrites its stored figures, and there is no undo.**
  The sheet therefore lists the Recipes a correction will update, and their before
  → after figures, before the User saves.
- **The barcode cannot be corrected.** It comes from the scanner, so a wrong one is
  fixed by deleting the Food and scanning again. This also rules out a per-User
  barcode collision on edit.
- **The Reference Food match is untouched by a correction** (ADR 0027). It is
  changed or cleared deliberately, by its own action and its own endpoint, never as
  a side effect of a rename. A match is something the User confirmed, so it does
  not wait on a second Save.
