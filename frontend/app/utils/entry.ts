import type { components } from '#open-fetch-schemas/api'

type EntryResponse = components['schemas']['EntryResponse']

/**
 * How an Entry reads as one line — its Food name (Weighed) or label (Estimated),
 * rounded calories, and protein when it has a figure, omitted when it doesn't:
 * `Banana — 107 kcal · 12 g protein`. Shared by the Today row, the delete
 * confirm and the "Entry logged" toast so the wording can't drift (ADR 0005).
 */
export function formatEntryName(entry: EntryResponse): string {
  return `${entry.foodName ?? entry.label} — ${formatIntakeFigures(entry.calories, entry.protein)}`
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
