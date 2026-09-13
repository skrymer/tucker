interface UseAsyncActionOptions {
  /**
   * Re-entry policy. `guard` ignores a call while one is pending (a double-tap
   * on Save must not fire two writes); `latest` aborts the prior in-flight call
   * and supersedes it (a newer barcode look-up wins over the old).
   */
  mode?: 'guard' | 'latest'
  /** Delay before `busy` flips true, so a fast call never flashes a spinner. */
  delayMs?: number
  /** Once `busy` shows, hold it at least this long so it never strobes away. */
  minBusyMs?: number
  /** Abort a hung request after this long. Omit to never time out. */
  timeoutMs?: number
}

/**
 * How a run ended. `superseded` covers a newer run taking over and an explicit
 * `cancel()` — in both cases something newer owns the screen, so the caller must
 * say nothing. `timedOut` is the opposite: nothing newer exists and the request
 * was abandoned, so the caller is the only one who can explain the silence.
 */
export type AsyncOutcome<TResult> =
  | { status: 'ok'; value: TResult }
  | { status: 'superseded' }
  | { status: 'timedOut' }

export function useAsyncAction<TArgs extends unknown[], TResult>(
  action: (signal: AbortSignal, ...args: TArgs) => Promise<TResult>,
  options: UseAsyncActionOptions = {},
) {
  const { mode = 'guard', delayMs = 150, minBusyMs = 400, timeoutMs } = options
  const pending = ref(false)
  // Null while no spinner is on screen, otherwise when the one on screen
  // appeared — which is the *spinner's* clock, not a run's. A newer run inherits
  // a spinner already up rather than raising a second one, so `minBusyMs` has to
  // run from when the user first saw it.
  const shownAt = ref<number | null>(null)
  const busy = computed(() => shownAt.value !== null)

  let activeController: AbortController | null = null
  // A monotonic id so only the most recent run owns `pending`/`busy` — a
  // superseded run must not clear the lifecycle out from under its successor.
  let activeRunId = 0

  async function run(...args: TArgs): Promise<AsyncOutcome<TResult>> {
    // A guarded re-entry is superseded in the same sense: the call in flight owns
    // the outcome, and this one must stay quiet.
    if (mode === 'guard' && pending.value) return { status: 'superseded' }
    if (mode === 'latest') activeController?.abort()

    const controller = new AbortController()
    activeController = controller
    const runId = ++activeRunId
    const isStale = () => runId !== activeRunId

    pending.value = true
    const delayTimer = setTimeout(() => {
      if (isStale()) return
      shownAt.value ??= Date.now()
    }, delayMs)
    const timeoutTimer =
      timeoutMs != null
        ? setTimeout(() => controller.abort(), timeoutMs)
        : undefined

    /**
     * Classify how this run ended. Staleness wins over abort: `cancel()` aborts
     * *and* orphans, and a caller that cancelled is not waiting to be told the
     * request timed out.
     */
    function settle(
      result: TResult | undefined,
      signal: AbortSignal,
    ): AsyncOutcome<TResult> {
      if (isStale()) return { status: 'superseded' }
      if (signal.aborted) return { status: 'timedOut' }
      return { status: 'ok', value: result as TResult }
    }

    function settleLifecycle() {
      clearTimeout(delayTimer)
      if (timeoutTimer) clearTimeout(timeoutTimer)
      // Only the latest run resolves the shared lifecycle.
      if (isStale()) return
      pending.value = false
      // The spinner, if it showed, lingers on a detached timer so the result is
      // returned now while the spinner can't strobe away under `minBusyMs`.
      const appearedAt = shownAt.value
      if (appearedAt !== null) {
        // Detached means the release can outlive this run: by the time it fires,
        // a newer run may own the spinner, and only that run may take it down.
        const releaseBusy = () => {
          if (!isStale()) shownAt.value = null
        }
        const remaining = minBusyMs - (Date.now() - appearedAt)
        if (remaining > 0) setTimeout(releaseBusy, remaining)
        else releaseBusy()
      }
    }

    try {
      // Race the action against its own abort signal so a timeout or cancel()
      // settles `run()` even if the action itself ignores the signal.
      const result = await Promise.race([
        action(controller.signal, ...args),
        rejectOnAbort(controller.signal),
      ])
      // A superseded or aborted run's result is discarded — but which of the two
      // happened is exactly what the caller needs, so it is reported, not lost.
      return settle(result, controller.signal)
    } catch (error) {
      if (isStale()) return { status: 'superseded' }
      // Only *this run's own* abort is a cancellation, and by here only the
      // timeout can have raised it: `cancel()` orphans the run and is answered
      // above. An `AbortError` the action raised itself cancelled nothing — an
      // unreachable push service rejects `pushManager.subscribe()` with one —
      // so the name is no test at all and it throws.
      if (controller.signal.aborted) return { status: 'timedOut' }
      throw error
    } finally {
      settleLifecycle()
    }
  }

  /** Abort the in-flight run (if any) and clear the busy lifecycle. */
  function cancel() {
    activeController?.abort()
    // Orphan the in-flight run so its settle can't touch the lifecycle.
    activeRunId++
    pending.value = false
    shownAt.value = null
  }

  return { pending, busy, run, cancel }
}

/** A promise that rejects with an AbortError the moment the signal aborts. */
function rejectOnAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    const fail = () => reject(new DOMException('Aborted', 'AbortError'))
    if (signal.aborted) fail()
    else signal.addEventListener('abort', fail, { once: true })
  })
}
