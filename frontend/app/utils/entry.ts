import type { components } from '#open-fetch-schemas/api'

type EntryResponse = components['schemas']['EntryResponse']

/**
 * An Entry as one run-on line — the name the API states for it, rounded
 * calories, and protein when it has a figure, omitted when it doesn't:
 * `Banana — 107 kcal · 12 g protein`.
 *
 * For the places that have room for only one line: the delete confirm's prose,
 * the "Entry logged" toast, and the accessible name of Today's delete button.
 * Today's row itself states the same words through `FigureRow`, laid out over
 * two — so the wording is shared and the shape is not (ADR 0005).
 */
export function formatEntryName(entry: EntryResponse): string {
  return `${formatName(entry.name)} — ${formatIntakeFigures(entry.calories, entry.protein)}`
}

/**
 * What was eaten stated as cost and return: `107 kcal · 12 g protein`. Protein is
 * omitted when there is no figure; a known 0 g is stated (CONTEXT.md). Shared by
 * the Today row and the Intake Breakdown legend so the wording can't drift.
 */
export function formatIntakeFigures(
  calories: number,
  protein: number | null | undefined,
): string {
  // `== null`, not falsiness, so a known 0 g survives.
  const returned = protein == null ? '' : ` · ${Math.round(protein)} g protein`
  return `${Math.round(calories)} kcal${returned}`
}

/**
 * What was taken against what was allowed: `1500 / 1800 kcal`. Both sides are
 * rounded, so the pair a User reads is the pair an over-target verdict is decided
 * on. Shared by the Day Ring, a Check and the Weight Timeline's readout.
 */
export function formatAgainstTarget(
  consumed: number,
  target: number,
  unit: string,
): string {
  return `${Math.round(consumed)} / ${Math.round(target)} ${unit}`
}
