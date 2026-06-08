/**
 * Sort weight measurements newest-first by their `measuredOn` ISO date.
 */
export function sortByMeasuredOnDesc<T extends { measuredOn: string }>(
  measurements: T[],
): T[] {
  return [...measurements].sort((a, b) =>
    b.measuredOn.localeCompare(a.measuredOn),
  )
}
