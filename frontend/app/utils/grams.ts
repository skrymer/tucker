/**
 * Format a weight in grams for display: rounded to whole grams with a
 * host-locale-independent thousands separator and the unit — e.g. 1400 → "1,400 g".
 * Shared by the Foods catalog recipe subline and the recipe composition view.
 */
export function formatGrams(grams: number): string {
  return `${Math.round(grams).toLocaleString('en-US')} g`
}
