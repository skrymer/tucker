interface UseOptionalFetchOptions {
  /**
   * Re-entry policy, named as `useAsyncAction`'s is. `guard` drops a load issued
   * while one is in flight, which is right while every call asks the same
   * question of an unchanged server; `latest` aborts the one in flight and
   * supersedes it, for a fetcher whose question can change between calls — a
   * re-read after a mutation is one, since the answer in flight may predate it
   * (ADR 0007 — supersede, don't reconcile).
   */
  mode?: 'guard' | 'latest'
}

/**
 * A read whose 404 means "none yet" rather than a failure: `data` is null and
 * so is `error`. Run ownership is `useAsyncAction`'s, so a superseded run —
 * aborted, or overtaken by a newer one — writes nothing either way: an abort is
 * not an application failure, and the run that caused it owns the screen.
 */
export function useOptionalFetch<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  options: UseOptionalFetchOptions = {},
) {
  const data = ref<T | null>(null) as Ref<T | null>
  const error = ref<unknown>(null)
  const { pending, run } = useAsyncAction(
    (signal: AbortSignal) => fetcher(signal),
    { mode: options.mode ?? 'guard' },
  )

  async function load() {
    try {
      const outcome = await run()
      if (outcome.status !== 'ok') return
      data.value = outcome.value
      error.value = null
    } catch (caught) {
      data.value = null
      error.value = isNotFound(caught) ? null : caught
    }
  }

  return { data, error, pending, load }
}
