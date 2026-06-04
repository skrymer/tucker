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

export function useAsyncAction<TArgs extends unknown[], TResult>(
  action: (signal: AbortSignal, ...args: TArgs) => Promise<TResult>,
  options: UseAsyncActionOptions = {},
) {
  const { mode = 'guard', delayMs = 150, minBusyMs = 400, timeoutMs } = options
  const pending = ref(false)
  const busy = ref(false)

  let activeController: AbortController | null = null
  // A monotonic id so only the most recent run owns `pending`/`busy` — a
  // superseded run must not clear the lifecycle out from under its successor.
  let activeRunId = 0

  async function run(...args: TArgs): Promise<TResult | undefined> {
    if (mode === 'guard' && pending.value) return
    if (mode === 'latest') activeController?.abort()

    const controller = new AbortController()
    activeController = controller
    const runId = ++activeRunId
    const isStale = () => runId !== activeRunId

    pending.value = true
    let shownAt = 0
    const delayTimer = setTimeout(() => {
      if (isStale()) return
      busy.value = true
      shownAt = Date.now()
    }, delayMs)
    const timeoutTimer =
      timeoutMs != null
        ? setTimeout(() => controller.abort(), timeoutMs)
        : undefined

    function settleLifecycle() {
      clearTimeout(delayTimer)
      if (timeoutTimer) clearTimeout(timeoutTimer)
      // Only the latest run resolves the shared lifecycle.
      if (isStale()) return
      pending.value = false
      // The spinner, if it showed, lingers on a detached timer so the result is
      // returned now while the spinner can't strobe away under `minBusyMs`.
      if (busy.value) {
        const remaining = minBusyMs - (Date.now() - shownAt)
        if (remaining > 0) setTimeout(() => (busy.value = false), remaining)
        else busy.value = false
      }
    }

    try {
      // Race the action against its own abort signal so a timeout or cancel()
      // settles `run()` even if the action itself ignores the signal.
      const result = await Promise.race([
        action(controller.signal, ...args),
        rejectOnAbort(controller.signal),
      ])
      // A superseded or aborted run's result is discarded.
      return controller.signal.aborted || isStale() ? undefined : result
    } catch (error) {
      if (controller.signal.aborted || isStale() || isAbortError(error))
        return undefined
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
    busy.value = false
  }

  return { pending, busy, run, cancel }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

/** A promise that rejects with an AbortError the moment the signal aborts. */
function rejectOnAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    const fail = () => reject(new DOMException('Aborted', 'AbortError'))
    if (signal.aborted) fail()
    else signal.addEventListener('abort', fail, { once: true })
  })
}
