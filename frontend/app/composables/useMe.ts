import type { components } from '#open-fetch-schemas/api'

type Me = components['schemas']['MeResponse']

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

  async function ready(): Promise<void> {
    if (settled.value) return
    try {
      me.value = await $api('/api/me', { retry: 0 })
      settled.value = true
    } catch (error) {
      console.warn('Could not read who is signed in', error)
    }
  }

  return {
    email: computed(() => me.value?.email ?? null),
    isAdmin: computed(() => me.value?.admin ?? false),
    ready,
  }
}
