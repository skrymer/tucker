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

/**
 * A run's visible lifecycle: `pending` for as long as the latest run is in
 * flight, and a spinner on its own clock. The spinner appears only once a run
 * has taken `delayMs`, so a fast call never flashes one, and once up it is held
 * at least `minBusyMs` so it never strobes away. Its clock is the *spinner's*,
 * not a run's: a newer run inherits a spinner already up rather than raising a
 * second one.
 */
function useRunLifecycle(delayMs: number, minBusyMs: number) {
  const pending = ref(false)
  // Null while no spinner is on screen, otherwise when the one on screen appeared.
  const shownAt = ref<number | null>(null)
  const busy = computed(() => shownAt.value !== null)

  /** A run began; the spinner follows the delay unless [isStale]. Returns its cancel. */
  function begin(isStale: () => boolean) {
    pending.value = true
    const timer = setTimeout(() => {
      if (!isStale()) shownAt.value ??= Date.now()
    }, delayMs)
    return () => clearTimeout(timer)
  }

  /**
   * A run ended; only the latest resolves the lifecycle. The spinner goes on a
   * detached timer, so the result is returned now while the spinner can't strobe
   * away under `minBusyMs` — and by the time it fires a newer run may own the
   * spinner, which only that run may take down.
   */
  function end(isStale: () => boolean) {
    if (isStale()) return
    pending.value = false
    const appearedAt = shownAt.value
    if (appearedAt === null) return
    const release = () => {
      if (!isStale()) shownAt.value = null
    }
    const remaining = minBusyMs - (Date.now() - appearedAt)
    if (remaining > 0) setTimeout(release, remaining)
    else release()
  }

  function clear() {
    pending.value = false
    shownAt.value = null
  }
  return { pending, busy, begin, end, clear }
}

/**
 * Which run is current. A monotonic id so only the most recent run owns
 * `pending`/`busy` — a superseded run must not clear the lifecycle out from
 * under its successor.
 */
function useRunOwnership() {
  let activeController: AbortController | null = null
  let activeRunId = 0

  /**
   * Start a run, aborting the one in flight when it is [superseding] it, and
   * aborting this one after [timeoutMs] if given.
   */
  function start(superseding: boolean, timeoutMs?: number) {
    if (superseding) activeController?.abort()
    const controller = new AbortController()
    activeController = controller
    const runId = ++activeRunId
    return {
      signal: controller.signal,
      isStale: () => runId !== activeRunId,
      stopTimeout: abortAfter(controller, timeoutMs),
    }
  }

  /** Abort the run in flight and orphan it, so its settle can't touch the lifecycle. */
  function orphan() {
    activeController?.abort()
    activeRunId++
  }
  return { start, orphan }
}

/** Abort [controller] after [timeoutMs], if given; returns the cancel. */
function abortAfter(controller: AbortController, timeoutMs?: number) {
  if (timeoutMs == null) return () => {}
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return () => clearTimeout(timer)
}

/**
 * Classify how a run ended. Staleness wins over abort: `cancel()` aborts *and*
 * orphans, and a caller that cancelled is not waiting to be told the request
 * timed out. A superseded or aborted run's result is discarded — but which of
 * the two happened is exactly what the caller needs, so it is reported, not lost.
 */
function outcomeOf<TResult>(
  result: TResult,
  stale: boolean,
  signal: AbortSignal,
): AsyncOutcome<TResult> {
  if (stale) return { status: 'superseded' }
  if (signal.aborted) return { status: 'timedOut' }
  return { status: 'ok', value: result }
}

/**
 * How a run that threw ended. Only *its own* abort is a cancellation, and past
 * staleness only the timeout can have raised it: `cancel()` orphans the run. An
 * `AbortError` the action raised itself cancelled nothing — an unreachable push
 * service rejects `pushManager.subscribe()` with one — so the name is no test at
 * all, and it throws.
 */
function failureOf(
  error: unknown,
  stale: boolean,
  signal: AbortSignal,
): AsyncOutcome<never> {
  if (stale) return { status: 'superseded' }
  if (signal.aborted) return { status: 'timedOut' }
  throw error
}

/**
 * One run of the work, classified. It races the work against its own abort
 * signal, so a timeout or `cancel()` settles the run even if the work itself
 * ignores the signal.
 */
async function attempt<TResult>(
  work: () => Promise<TResult>,
  signal: AbortSignal,
  isStale: () => boolean,
): Promise<AsyncOutcome<TResult>> {
  try {
    const result = await Promise.race([work(), rejectOnAbort(signal)])
    return outcomeOf(result, isStale(), signal)
  } catch (error) {
    return failureOf(error, isStale(), signal)
  }
}

export function useAsyncAction<TArgs extends unknown[], TResult>(
  action: (signal: AbortSignal, ...args: TArgs) => Promise<TResult>,
  options: UseAsyncActionOptions = {},
) {
  const { mode = 'guard', delayMs = 150, minBusyMs = 400, timeoutMs } = options
  const lifecycle = useRunLifecycle(delayMs, minBusyMs)
  const runs = useRunOwnership()

  async function run(...args: TArgs): Promise<AsyncOutcome<TResult>> {
    // A guarded re-entry is superseded in the same sense: the call in flight owns
    // the outcome, and this one must stay quiet.
    if (mode === 'guard' && lifecycle.pending.value) {
      return { status: 'superseded' }
    }
    const { signal, isStale, stopTimeout } = runs.start(
      mode === 'latest',
      timeoutMs,
    )
    const stopSpinnerDelay = lifecycle.begin(isStale)
    try {
      return await attempt(() => action(signal, ...args), signal, isStale)
    } finally {
      stopSpinnerDelay()
      stopTimeout()
      lifecycle.end(isStale)
    }
  }

  /** Abort the in-flight run (if any) and clear the busy lifecycle. */
  function cancel() {
    runs.orphan()
    lifecycle.clear()
  }

  return { pending: lifecycle.pending, busy: lifecycle.busy, run, cancel }
}

/** A promise that rejects with an AbortError the moment the signal aborts. */
function rejectOnAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    const fail = () => reject(new DOMException('Aborted', 'AbortError'))
    if (signal.aborted) fail()
    else signal.addEventListener('abort', fail, { once: true })
  })
}
