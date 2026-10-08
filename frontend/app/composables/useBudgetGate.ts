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

/** The heads-up a projection calls for, or null when the entry fits the budget. */
function warningFrom(
  projection: BudgetProjectionResponse,
): BudgetWarning | null {
  const { wouldExceedBudget, calorieBudget, overByKcal } = projection
  if (!wouldExceedBudget || calorieBudget == null || overByKcal == null) {
    return null
  }
  return { overByKcal, calorieBudget }
}

/**
 * The projection, or null when it could not be had. Fail open (CONTEXT.md — the
 * projection informs, it never blocks logging): a warning that can't be
 * computed must not stop the user logging what they ate.
 */
async function projectionOrNull<TPayload>(
  preview: BudgetGateOptions<TPayload>['preview'],
  payload: TPayload,
) {
  try {
    return await preview(payload)
  } catch (error) {
    console.warn(
      'Budget projection failed; logging without a budget check',
      error,
    )
    return null
  }
}

/** The warning on screen, and the entry it was projected for. */
function useShownWarning<TPayload>() {
  const warning = ref<BudgetWarning | null>(null)
  let warnedFor: string | null = null
  function show(next: BudgetWarning | null, payload: TPayload) {
    warning.value = next
    if (next) warnedFor = JSON.stringify(payload)
  }
  /**
   * A warning is already showing for this very entry, so this tap is the
   * deliberate "Log anyway". One stamped differently since (a later day, after
   * midnight) was never projected, so it is checked afresh.
   */
  const confirmedBy = (payload: TPayload) =>
    warning.value !== null && JSON.stringify(payload) === warnedFor
  return { warning, show, confirmedBy, clear: () => (warning.value = null) }
}

/**
 * The confirm-to-proceed gate for logging an Entry. `attempt` previews the entry at
 * the Save gesture: within budget it commits straight away; over budget it raises a
 * `warning` instead of committing, and a second `attempt` (the deliberate "Log
 * anyway") commits. `reset` clears the warning when the form is edited. A failed
 * preview fails open — it commits rather than blocking logging.
 */
export function useBudgetGate<TPayload>(options: BudgetGateOptions<TPayload>) {
  const shown = useShownWarning<TPayload>()
  const pending = ref(false)
  // Bumped whenever the form is edited; a projection that resolves against a
  // superseded token is stale and must not warn or commit (the user has since
  // changed the food/grams it was computed for).
  let token = 0
  /** Preview, then warn or commit — unless the form changed meanwhile. */
  async function project(payload: TPayload) {
    const attemptToken = ++token
    const projection = await projectionOrNull(options.preview, payload)
    if (attemptToken !== token) return // the form changed while previewing
    const warning = projection && warningFrom(projection)
    shown.show(warning, payload)
    if (!warning) await options.commit(payload)
  }

  async function attempt(payload: TPayload) {
    if (pending.value) return // a projection is already in flight — ignore the re-tap
    const confirmed = shown.confirmedBy(payload)
    shown.clear()
    if (confirmed) return options.commit(payload)
    pending.value = true
    try {
      await project(payload)
    } finally {
      pending.value = false
    }
  }

  function reset() {
    token++ // invalidate any in-flight projection
    shown.clear()
  }

  return { warning: shown.warning, pending, attempt, reset }
}
