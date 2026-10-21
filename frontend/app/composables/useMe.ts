import type { components } from '#open-fetch-schemas/api'

type Me = components['schemas']['MeResponse']

/** One read at a time, app-wide: a caller that arrives mid-read joins it. */
function useJoinedRead(read: () => Promise<void>) {
  const inFlight = useState<Promise<void> | null>(
    'tucker:me:in-flight',
    () => null,
  )
  return (): Promise<void> => {
    inFlight.value ??= read().finally(() => {
      inFlight.value = null
    })
    return inFlight.value
  }
}

/**
 * Who is signed in (`/api/me`), read once per page load and shared app-wide: the
 * nav starts it, and the Admin gate and the byline join it. `retry: 0` because
 * `/admin` holds its navigation on it and a failure answers itself (ADR 0007).
 *
 * A failed read is logged, names nobody and makes nobody an Admin, and settles
 * nothing, so the next caller asks again. Not `useOptionalFetch`, which folds a
 * 404 into "absent": here a 404 means a backend that predates `/api/me`, a partial
 * deploy, and is the one failure worth hearing about.
 */
export function useMe() {
  const { $api } = useNuxtApp()
  const me = useState<Me | null>('tucker:me', () => null)
  const settled = useState('tucker:me:settled', () => false)

  async function read(): Promise<void> {
    try {
      me.value = await $api('/api/me', { retry: 0 })
      settled.value = true
    } catch (error) {
      console.warn('Could not read who is signed in', error)
    }
  }

  const joined = useJoinedRead(read)

  /** Resolves once the read has landed: joins one in flight, or starts one. */
  async function ready(): Promise<void> {
    if (settled.value) return
    await joined()
  }

  return {
    email: computed(() => me.value?.email ?? null),
    isAdmin: computed(() => me.value?.admin ?? false),
    ready,
  }
}
