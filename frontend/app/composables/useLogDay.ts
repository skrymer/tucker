import type { BudgetWarning } from '~/composables/useBudgetGate'
import type { RelativeDay } from '~/utils/day'

/**
 * The day an Entry form logs for, opening on Today, and the copy that follows
 * it: a budget [warning] phrased for that day, and a submit labelled from
 * [labels] — or "Log anyway" while a warning shows.
 */
export function useLogDay(
  warning: () => BudgetWarning | null | undefined,
  labels: Record<RelativeDay, string>,
) {
  const day = ref<RelativeDay>('today')
  const warningMessage = computed(() =>
    formatBudgetWarning(warning(), day.value),
  )
  const submitLabel = computed(() =>
    warningMessage.value ? 'Log anyway' : labels[day.value],
  )
  return { day, warningMessage, submitLabel }
}
