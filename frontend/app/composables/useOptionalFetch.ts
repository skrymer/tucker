function isNotFound(caught: unknown): boolean {
  return (caught as { status?: number })?.status === 404
}

export function useOptionalFetch<T>(fetcher: () => Promise<T>) {
  const data = ref<T | null>(null) as Ref<T | null>
  const error = ref<unknown>(null)
  const pending = ref(false)

  async function load() {
    // A double-tapped Retry must not race two fetches — the loser could
    // resolve after the winner and clobber fresher data with stale.
    if (pending.value) return
    pending.value = true
    try {
      data.value = await fetcher()
      error.value = null
    } catch (caught) {
      data.value = null
      error.value = isNotFound(caught) ? null : caught
    } finally {
      pending.value = false
    }
  }

  return { data, error, pending, load }
}
