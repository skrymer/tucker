import type { components } from '#open-fetch-schemas/api'

type MicronutrientAmount = components['schemas']['MicronutrientAmountResponse']

/**
 * The figures that tell a search's candidates apart, as one subline.
 *
 * Which nutrients — and their order — is the backend's call (ADR 0002,
 * `ReferenceFoodSearch.distinguishing`); this only reads them out. A figure is
 * unreadable without its unit, and 0.4 µg of iodine against 490 mg of sodium is
 * the whole reason the unit rides along per nutrient rather than per list.
 */
export function distinguishingLine(amounts: MicronutrientAmount[]): string {
  return amounts
    .map((amount) => `${amount.label} ${amount.amount} ${amount.unit}`)
    .join(' · ')
}
