interface UseOptionalFetchOptions {
  /**
   * Re-entry policy, named as `useAsyncAction`'s is. `guard` drops a load issued
   * while one is in flight, which is right while every call asks the same
   * question; `latest` aborts the one in flight and supersedes it, for a fetcher
   * whose question can change between calls (ADR 0007 — supersede, don't
   * reconcile).
   */
  mode?: 'guard' | 'latest'
}

export function useOptionalFetch<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  options: UseOptionalFetchOptions = {},
) {
  const { mode = 'guard' } = options
  const data = ref<T | null>(null) as Ref<T | null>
  const error = ref<unknown>(null)
  const pending = ref(false)

  let inFlight: AbortController | null = null
  // A monotonic id so only the newest run may write: an aborted request still
  // settles, and it must not clobber fresher data with stale on its way out.
  let latestRun = 0

  async function load() {
    if (mode === 'guard' && pending.value) return
    if (mode === 'latest') inFlight?.abort()
    const controller = new AbortController()
    inFlight = controller
    const run = ++latestRun
    const isStale = () => run !== latestRun
    pending.value = true
    try {
      const result = await fetcher(controller.signal)
      if (isStale()) return
      data.value = result
      error.value = null
    } catch (caught) {
      // An abort is not an application failure, and the run that caused it owns
      // the screen — so a superseded run says nothing either way.
      if (isStale()) return
      data.value = null
      error.value = isNotFound(caught) ? null : caught
    } finally {
      if (!isStale()) pending.value = false
    }
  }

  return { data, error, pending, load }
}
