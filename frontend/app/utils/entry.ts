import type { components } from '#open-fetch-schemas/api'

type EntryResponse = components['schemas']['EntryResponse']

/**
 * An Entry as one run-on line — the name the API states for it, then its
 * figures: `Banana — 120 g · 107 kcal · 12 g protein`.
 *
 * For the places that have room for only one line: the delete confirm's prose,
 * the "Entry logged" toast, and the accessible name of Today's delete button.
 * Today's row itself states the same words through `FigureRow`, laid out over
 * two — so the wording is shared and the shape is not (ADR 0005).
 */
export function formatEntryName(entry: EntryResponse): string {
  return `${formatName(entry.name)} — ${formatEntryFigures(entry)}`
}

/**
 * An Entry's figures with the portion first when it was weighed:
 * `120 g · 107 kcal · 12 g protein`. An Estimated Entry has no grams to state.
 */
export function formatEntryFigures(entry: EntryResponse): string {
  const figures = formatIntakeFigures(entry.calories, entry.protein)
  return entry.grams == null
    ? figures
    : `${formatGrams(entry.grams)} · ${figures}`
}

/**
 * What was eaten stated as cost and return: `107 kcal · 12 g protein`. Protein is
 * omitted when there is no figure; a known 0 g is stated (CONTEXT.md). Shared so
 * the cost-and-return wording can't drift.
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

/** A day list's tally: `3 entries · 1,188 kcal`. */
export function formatDayTally(count: number, calories: number): string {
  const noun = count === 1 ? 'entry' : 'entries'
  return `${count} ${noun} · ${Math.round(calories).toLocaleString('en-GB')} kcal`
}
