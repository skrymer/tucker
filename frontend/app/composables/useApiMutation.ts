interface ApiMutationOptions<TResult> {
  /** Toast title shown when the mutation throws. */
  errorTitle: string
  /** Toast title shown on success. Omit for a silent success. */
  successTitle?: string
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
   * instead of the "check your connection" retry toast.
   */
  onValidationError?: (message: string) => void
}

/**
 * The backend's `{ message }` body for an [IllegalArgumentException] → 400, or
 * null when the rejection isn't a validation error a form should surface.
 */
function validationMessage(error: unknown): string | null {
  const e = error as { status?: number; data?: { message?: string } }
  if (e?.status !== 400) return null
  return e.data?.message ?? null
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
  options: ApiMutationOptions<TResult>,
) {
  const toast = useToast()

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

  // Stable per-mutation id so a repeated identical failure pulses the existing
  // toast instead of stacking, and a later success can dismiss it by id.
  const errorToastId = `mutation-error:${options.errorTitle}`

  async function execute(...args: TArgs) {
    if (pending.value) return
    let outcome: AsyncOutcome<TResult>
    try {
      outcome = await run(...args)
    } catch (error) {
      // An expired session already switches the whole app to the signed-out
      // interstitial (useAuthGate) — the generic "check your connection,
      // Retry" toast would be exactly the wrong advice DESIGN.md's Feedback
      // states section warns against layering on top of it, and Retry would
      // just repeat the same expired-session failure forever.
      if (useAuthGate().isSignedOut.value) return
      const message = validationMessage(error)
      if (message && options.onValidationError) {
        // A wrong input, not a flaky connection: hand it to the form and clear
        // any stale transient toast rather than offering a pointless retry.
        toast.remove(errorToastId)
        options.onValidationError(message)
        return
      }
      toast.add({
        id: errorToastId,
        title: options.errorTitle,
        description: CONNECTION_ERROR_MESSAGE,
        color: 'error',
        // A failed save is high-stakes on a phone: persist until the user
        // acknowledges it, with an assertive live region and an explicit close.
        type: 'foreground',
        duration: Infinity,
        close: true,
        // No countdown bar — there's no auto-dismiss to count down to.
        progress: false,
        // Retry replays the same call — `args` is captured from this attempt,
        // so no re-entry of the form is needed. The pending guard stops a
        // double-tap from firing two mutations.
        actions: [{ label: 'Retry', onClick: () => execute(...args) }],
      })
      return
    }
    // A run that didn't finish owns nothing to announce, so it may neither clear
    // a failure it never resolved nor confirm a save that may not have landed.
    //
    // `superseded` is unreachable from here — `guard` mode, no `cancel` exposed,
    // and `execute` bounces re-entry before `run` is ever called. `timedOut` is
    // *not*: this factory passes no `timeoutMs`, but useAsyncAction also
    // classifies an `AbortError` DOMException thrown by the action itself as a
    // timeout, and the reminder toggle's mutation calls `pushManager.subscribe()`
    // — spec'd to reject with exactly that when the push service is unreachable.
    // Without this guard that run falls through and silently *dismisses* the
    // retry toast a previous failure left up, telling the user a subscribe that
    // never happened had succeeded.
    if (outcome.status !== 'ok') return
    if (useAuthGate().isSignedOut.value) return
    // A successful (re)try clears any persistent failure toast for this
    // mutation — the snackbar is dismissed only by success or by the user.
    toast.remove(errorToastId)
    if (options.successTitle) {
      // Polite live region (Reka defaults to assertive) — a confirmation
      // should never interrupt.
      toast.add({
        title: options.successTitle,
        description: options.successDescription?.(outcome.value),
        color: 'success',
        type: 'background',
      })
    }
  }

  return { pending, busy, execute }
}
