/** The backend's earned day verdict on `DailySummaryResponse.dayStatus`. */
export type DayStatus = 'on-target' | 'over-budget' | 'in-progress'

/**
 * Presentation for a [DayStatus]: the verdict label, its icon, and a text
 * colour — or `null` when the day has earned no verdict. Only on-target (success)
 * and over-budget (error) are shown; an in-progress or pre-review (absent) day
 * has none, so the progress bars carry the numbers instead. The classification
 * itself is the backend's; this only maps it (ADR 0002).
 */
export function dayStatusVerdict(
  status: DayStatus | null | undefined,
): { label: string; icon: string; class: string } | null {
  switch (status) {
    case 'on-target':
      return {
        label: 'On target',
        icon: 'i-lucide-circle-check',
        class: 'text-success',
      }
    case 'over-budget':
      return {
        label: 'Over budget',
        icon: 'i-lucide-circle-x',
        class: 'text-error',
      }
    default:
      return null
  }
}
