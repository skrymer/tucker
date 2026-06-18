import type { components } from '#open-fetch-schemas/api'

type BudgetProjectionResponse =
  components['schemas']['BudgetProjectionResponse']

/** The over-budget heads-up shown before an Entry is committed (CONTEXT.md — Budget Projection). */
export interface BudgetWarning {
  overByKcal: number
  calorieBudget: number
}

export interface BudgetGateOptions<TPayload> {
  /** Forecast the day's over-budget state if this entry were logged (non-persisting). */
  preview: (payload: TPayload) => Promise<BudgetProjectionResponse>
  /** Commit the entry for real. */
  commit: (payload: TPayload) => unknown
}

/**
 * The confirm-to-proceed gate for logging an Entry. `attempt` previews the entry at
 * the Save gesture: within budget it commits straight away; over budget it raises a
 * `warning` instead of committing, and a second `attempt` (the deliberate "Log
 * anyway") commits. `reset` clears the warning when the form is edited. A failed
 * preview fails open — it commits rather than blocking logging.
 */
export function useBudgetGate<TPayload>(options: BudgetGateOptions<TPayload>) {
  const warning = ref<BudgetWarning | null>(null)
  const pending = ref(false)
  // Bumped whenever the form is edited; a projection that resolves against a
  // superseded token is stale and must not warn or commit (the user has since
  // changed the food/grams it was computed for).
  let token = 0

  async function attempt(payload: TPayload) {
    if (pending.value) return // a projection is already in flight — ignore the re-tap

    // A warning is already showing — this tap is the deliberate "Log anyway".
    if (warning.value) {
      warning.value = null
      await options.commit(payload)
      return
    }

    const attemptToken = ++token
    const fresh = () => attemptToken === token
    pending.value = true
    try {
      let projection: BudgetProjectionResponse
      try {
        projection = await options.preview(payload)
      } catch (error) {
        // Fail open (CONTEXT.md — the projection informs, it never blocks logging):
        // a warning we can't compute must not stop the user logging what they ate.
        console.warn(
          'Budget projection failed; logging without a budget check',
          error,
        )
        if (fresh()) await options.commit(payload)
        return
      }
      if (!fresh()) return // the form changed while previewing — drop the stale result
      if (
        projection.wouldExceedBudget &&
        projection.calorieBudget != null &&
        projection.overByKcal != null
      ) {
        warning.value = {
          overByKcal: projection.overByKcal,
          calorieBudget: projection.calorieBudget,
        }
        return
      }
      await options.commit(payload)
    } finally {
      pending.value = false
    }
  }

  function reset() {
    token++ // invalidate any in-flight projection
    warning.value = null
  }

  return { warning, pending, attempt, reset }
}
