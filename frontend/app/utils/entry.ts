import type { components } from '#open-fetch-schemas/api'

type EntryResponse = components['schemas']['EntryResponse']

/**
 * How an Entry reads as one line — its Food name (Weighed) or label (Estimated)
 * with rounded calories, e.g. `Banana — 107 kcal`. Shared so the Today row and
 * the delete confirm name the entry identically (the confirm names it "as the
 * row reads it"), and the wording can't drift between them.
 */
export function formatEntryName(entry: EntryResponse): string {
  return `${entry.foodName ?? entry.label} — ${Math.round(entry.calories)} kcal`
}
