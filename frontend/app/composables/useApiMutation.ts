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

  async function execute(...args: TArgs) {
    if (pending.value) return
    pending.value = true
    try {
      await mutate(...args)
      await options.onSuccess?.()
      if (options.successTitle) {
        toast.add({ title: options.successTitle, color: 'success' })
      }
    } catch {
      toast.add({
        title: options.errorTitle,
        description: 'Check your connection and try again.',
        color: 'error',
      })
    } finally {
      pending.value = false
    }
  }

  return { pending, execute }
}
