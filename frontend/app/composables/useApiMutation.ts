interface ApiMutationOptions {
  /** Toast title shown when the mutation throws. */
  errorTitle: string
  /** Toast title shown on success. Omit for a silent success. */
  successTitle?: string
  /** Side effects to run after a successful mutation (close, refresh, emit). */
  onSuccess?: () => void | Promise<void>
}

/**
 * Wraps a `$api` mutation with the boilerplate every form shares: a `pending`
 * flag, a re-entry guard, a failure toast, and post-success side effects.
 *
 * The success specifics (closing a sheet, refreshing data, a success toast)
 * stay with the caller via [options.onSuccess] and [options.successTitle], since
 * they vary per form; only the truly identical parts live here.
 */
export function useApiMutation<TArgs extends unknown[]>(
  mutate: (...args: TArgs) => Promise<unknown>,
  options: ApiMutationOptions,
) {
  const pending = ref(false)
  const toast = useToast()

  // Stable per-mutation id so a repeated identical failure pulses the existing
  // toast instead of stacking, and a later success can dismiss it by id.
  const errorToastId = `mutation-error:${options.errorTitle}`

  async function execute(...args: TArgs) {
    if (pending.value) return
    pending.value = true
    try {
      await mutate(...args)
      await options.onSuccess?.()
      // A successful (re)try clears any persistent failure toast for this
      // mutation — the snackbar is dismissed only by success or by the user.
      toast.remove(errorToastId)
      if (options.successTitle) {
        // Polite live region (Reka defaults to assertive) — a confirmation
        // should never interrupt.
        toast.add({
          title: options.successTitle,
          color: 'success',
          type: 'background',
        })
      }
    } catch {
      toast.add({
        id: errorToastId,
        title: options.errorTitle,
        description: 'Check your connection and try again.',
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
    } finally {
      pending.value = false
    }
  }

  return { pending, execute }
}
