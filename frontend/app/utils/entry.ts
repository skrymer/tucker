import type { components } from '#open-fetch-schemas/api'

type EntryResponse = components['schemas']['EntryResponse']

/**
 * How an Entry reads as one line — its Food name (Weighed) or label (Estimated),
 * rounded calories, and protein when it has a figure, omitted when it doesn't:
 * `Banana — 107 kcal · 12 g protein`. Shared by the Today row, the delete
 * confirm and the "Entry logged" toast so the wording can't drift (ADR 0005).
 */
export function formatEntryName(entry: EntryResponse): string {
  // `== null`, not falsiness: a known 0 g is stated, not omitted (CONTEXT.md).
  const protein =
    entry.protein == null ? '' : ` · ${Math.round(entry.protein)} g protein`
  return `${entry.foodName ?? entry.label} — ${Math.round(entry.calories)} kcal${protein}`
}
