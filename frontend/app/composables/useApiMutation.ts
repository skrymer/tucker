interface ApiMutationOptions<TArgs extends unknown[], TResult> {
  /** Toast title shown when the mutation throws. */
  errorTitle: string
  /**
   * Toast title shown on success. Omit for a silent success; a function when
   * the title depends on the result or the arguments.
   */
  successTitle?: string | ((result: TResult, ...args: TArgs) => string)
  /**
   * Second line of the success toast, naming *which* record landed — e.g. the
   * Entry the server just recorded, in the words the Today row uses for it
   * (ADR 0005, "The kept toast names the Entry it confirms"). A function of the
   * result rather than a string because only the response knows. Ignored
   * without a [successTitle]: there is no toast to describe.
   */
  successDescription?: (result: TResult) => string
  /** Side effects to run after a successful mutation (close, refresh, emit). */
  onSuccess?: () => void | Promise<void>
  /**
   * Handle a 400 validation rejection (a bad input, not a transient failure).
   * When provided, the backend's message is routed here — to a form field —
   * instead of the "check your connection" retry toast. `field` names the input
   * at fault where the backend could name one, so a form with more than one
   * refusable input shows it against the right one.
   */
  onValidationError?: (message: string, field: string | null) => void
  /**
   * Where the failure toast's Retry goes, for a caller that runs its own
   * attempts one after another: re-running straight away would be dropped by
   * the re-entry guard whenever the caller has another attempt in flight.
   */
  retry?: (...args: TArgs) => void
}

/**
 * The backend's `{ message, field }` body for an `IllegalArgumentException` → 400,
 * or null when the rejection isn't a validation error a form should surface.
 */
function validationRejection(
  error: unknown,
): { message: string; field: string | null } | null {
  const e = error as {
    status?: number
    data?: { message?: string; field?: string | null }
  }
  if (e?.status !== 400 || e.data?.message == null) return null
  return { message: e.data.message, field: e.data.field ?? null }
}

/**
 * How many error toasts each mutation has had closed, keyed by the id it raises
 * them under. Held in app state beside the toast list itself, not in the
 * factory's closure: a persistent failure outlives the component that raised it,
 * so a counter reborn on remount would forget which id the live toast occupies
 * and leave nothing able to take it down.
 */
function useSpentErrorToasts() {
  return useState<Record<string, number>>('spent-error-toasts', () => ({}))
}

/** The failure toast itself, under [id], its Retry calling [onRetry]. */
function failureToast(id: string, title: string, onRetry: () => unknown) {
  return {
    id,
    title,
    description: CONNECTION_ERROR_MESSAGE,
    color: 'error' as const,
    // A failed save is high-stakes on a phone: persist until the user
    // acknowledges it, with an assertive live region and an explicit close.
    type: 'foreground' as const,
    duration: Infinity,
    close: true,
    // No countdown bar — there's no auto-dismiss to count down to.
    progress: false,
    actions: [{ label: 'Retry', onClick: onRetry }],
  }
}

/**
 * A mutation's ADR 0005 failure toast: persistent, assertive, and carrying a
 * Retry. One id per mutation, so a repeated identical failure pulses the
 * existing toast instead of stacking — held until the toast it names is closed,
 * and replaced then.
 */
function useMutationErrorToast(title: string) {
  const toast = useToast()
  const baseId = `mutation-error:${title}`
  const spent = useSpentErrorToasts()
  const id = () => `${baseId}#${spent.value[baseId] ?? 0}`

  /**
   * Give up the id of a toast that has been closed. Nuxt UI deletes a closed
   * toast a fraction of a second later, and a re-`add` under its id in the
   * meantime is merged into the dying toast rather than mounting a new one — so
   * the next failure would be swept away with it. See ADR 0005, "Errors — a
   * persistent retryable snackbar".
   */
  function spend() {
    spent.value[baseId] = (spent.value[baseId] ?? 0) + 1
  }

  /** Take down the toast, if it still has one up. */
  function dismiss() {
    toast.remove(id())
    spend()
  }

  /** Tapping the Retry is itself a close, which Nuxt UI gives no way to opt out of. */
  function announce(retry: () => unknown) {
    toast.add(
      failureToast(id(), title, () => {
        spend()
        return retry()
      }),
    )
  }
  return { announce, dismiss }
}

/**
 * The success toast, when the caller asked for one. Polite live region (Reka
 * defaults to assertive) — a confirmation should never interrupt.
 */
function useSuccessToast<TArgs extends unknown[], TResult>(
  options: ApiMutationOptions<TArgs, TResult>,
) {
  const toast = useToast()
  return (result: TResult, args: TArgs) => {
    const { successTitle: title } = options
    if (!title) return
    toast.add({
      title: typeof title === 'function' ? title(result, ...args) : title,
      description: options.successDescription?.(result),
      color: 'success',
      type: 'background',
    })
  }
}

/** What a mutation's failure, or its outcome, tells the User. */
function useMutationFeedback<TArgs extends unknown[], TResult>(
  options: ApiMutationOptions<TArgs, TResult>,
) {
  const errors = useMutationErrorToast(options.errorTitle)
  const announceSuccess = useSuccessToast(options)

  function failed(error: unknown, retry: () => unknown) {
    // An expired session already switches the whole app to the signed-out
    // interstitial (useAuthGate) — the generic "check your connection, Retry"
    // toast would be exactly the wrong advice DESIGN.md's Feedback states
    // section warns against layering on top of it, and Retry would just repeat
    // the same expired-session failure forever.
    if (useAuthGate().isSignedOut.value) return
    const rejection = validationRejection(error)
    if (!rejection || !options.onValidationError) return errors.announce(retry)
    // A wrong input, not a flaky connection: hand it to the form and clear any
    // stale transient toast rather than offering a pointless retry.
    errors.dismiss()
    options.onValidationError(rejection.message, rejection.field)
  }

  function settled(
    outcome: AsyncOutcome<TResult>,
    args: TArgs,
    retry: () => unknown,
  ) {
    if (useAuthGate().isSignedOut.value) return
    // Neither unfinished outcome may clear a failure it never resolved or
    // confirm a save that may not have landed — but they are opposites past
    // that (ADR 0007). Something newer owns the screen after a supersede, so
    // this one says nothing; after a timeout nothing does, and the caller is
    // the only one who can explain the silence — which for a mutation is
    // ADR 0005's failure toast. Neither is reachable as this factory stands
    // (`guard` mode with no `cancel` rules out one, no `timeoutMs` the other),
    // so each states what it would owe rather than sharing an answer.
    if (outcome.status === 'superseded') return
    if (outcome.status === 'timedOut') return errors.announce(retry)
    // A successful (re)try clears any persistent failure toast for this
    // mutation — the snackbar is dismissed only by success or by the user.
    errors.dismiss()
    announceSuccess(outcome.value, args)
  }
  return { failed, settled }
}

/**
 * Wraps a `$api` mutation with the boilerplate every form shares: a `pending`
 * flag, a re-entry guard, a failure toast, and post-success side effects.
 *
 * The success specifics (closing a sheet, refreshing data, a success toast)
 * stay with the caller via [options.onSuccess] and [options.successTitle], since
 * they vary per form; only the truly identical parts live here.
 */
export function useApiMutation<TArgs extends unknown[], TResult>(
  mutate: (...args: TArgs) => Promise<TResult>,
  options: ApiMutationOptions<TArgs, TResult>,
) {
  // The pending lifecycle + re-entry guard live in the shared primitive
  // (ADR 0007); this factory layers the ADR-0005 toast policy on top. A
  // mutation is `guard` mode — a double-tap must not fire two writes — and the
  // success side effects run inside the action so a failing `onSuccess` lands on
  // the error path, exactly as before.
  const { pending, busy, run } = useAsyncAction<TArgs, TResult>(
    async (_signal, ...args) => {
      const result = await mutate(...args)
      // A mutation that resolves without throwing — e.g. an intercepted
      // opaque-redirect response the underlying fetch client didn't treat
      // as an error — must not be celebrated as a real save; the signed-out
      // interstitial is about to replace the whole app regardless.
      if (!useAuthGate().isSignedOut.value) await options.onSuccess?.()
      return result
    },
  )
  const feedback = useMutationFeedback(options)

  /**
   * Replay a failed call with the attempt's own arguments — through the
   * caller's [options.retry] when it queues its own attempts.
   */
  function retry(...args: TArgs): void | Promise<void> {
    if (options.retry) return options.retry(...args)
    return execute(...args)
  }

  async function execute(...args: TArgs): Promise<void> {
    if (pending.value) return
    let outcome: AsyncOutcome<TResult>
    try {
      outcome = await run(...args)
    } catch (error) {
      return feedback.failed(error, () => retry(...args))
    }
    feedback.settled(outcome, args, () => retry(...args))
  }

  return { pending, busy, execute }
}
