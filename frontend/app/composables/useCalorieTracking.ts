import type { components } from '#open-fetch-schemas/api'

/** Tucker counts calories unless the User has said otherwise (Profile.tracksCalories). */
export const DEFAULT_TRACKS_CALORIES = true

/** The setting itself: app-wide, and Tucker's default until a Profile says otherwise. */
function useTrackingSetting() {
  const tracksCalories = useState(
    'tucker:tracks-calories',
    () => DEFAULT_TRACKS_CALORIES,
  )
  /** Take the setting from a Profile just read, or the default from its absence. */
  function readFrom(
    profile: Pick<components['schemas']['ProfileDto'], 'tracksCalories'> | null,
  ): void {
    tracksCalories.value = profile?.tracksCalories ?? DEFAULT_TRACKS_CALORIES
  }
  return { tracksCalories, readFrom }
}

/**
 * Reading the setting off the Profile. `retry: 0` because the shell holds first
 * paint on this read, and ofetch's stock GET retry would double that wait for a
 * failure that falls back anyway (ADR 0007). Resolves true when it answered.
 */
function useProfileRead(
  readFrom: ReturnType<typeof useTrackingSetting>['readFrom'],
) {
  const { $api } = useNuxtApp()
  const {
    data: profile,
    error,
    load,
  } = useOptionalFetch(() => $api('/api/profile', { retry: 0 }))
  return async (): Promise<boolean> => {
    await load()
    // A 404 — no Profile yet — is an expected empty state and leaves `error`
    // null, so it reads as the default. Anything else is a read that should have
    // worked: the setting is left as it stands rather than restated from a
    // failure, and the app quietly keeping its shape is not its only trace.
    if (error.value) {
      console.warn(
        'Could not read Calorie Tracking off the profile',
        error.value,
      )
      return false
    }
    readFrom(profile.value)
    return true
  }
}

/**
 * The one read, shared app-wide. The navigation starts it; a page that needs the
 * settled value joins it through `ready` instead of issuing a second. Held in
 * app state, because a page asking "has this settled?" of a fresh instance would
 * otherwise always be told no, and re-issue the read on every navigation.
 */
function useSettledRead(read: () => Promise<boolean>) {
  const inFlight = useState<Promise<boolean> | null>(
    'tucker:tracks-calories:in-flight',
    () => null,
  )
  const settled = useState('tucker:tracks-calories:settled', () => false)

  async function load(): Promise<void> {
    const started = read()
    inFlight.value = started
    try {
      // Only a read that *answered* settles the question, and it never
      // unsettles: an earlier answer outlives a later failure. A failed read
      // leaves the User holding Tucker's default shape, and calling that settled
      // would let one transient 502 decide what the app looks like for the rest
      // of the session — a weight-only User would get the log half back with no
      // way to be rid of it, since the navigation reads this once per full load.
      // Re-asking costs one GET on a page the User navigated to anyway, which is
      // not the doubled *wait* ADR 0007 rules out.
      if (await started) settled.value = true
    } finally {
      if (inFlight.value === started) inFlight.value = null
    }
  }

  /**
   * Resolve once the setting is settled — the value a *setup* may read.
   *
   * A template may read `tracksCalories` directly: the navigation awaits [load]
   * and both are in one Suspense boundary, so it has landed by first paint. A
   * setup has no such guarantee (see `AppNav.vue`), and reading it there without
   * this returns the default until the request lands — silently, and only
   * sometimes, which is the worst shape of wrong.
   */
  async function ready(): Promise<void> {
    // A read in flight is joined first, even once one has settled before: the
    // newest answer is the one the caller wants, and joining is free.
    if (inFlight.value) {
      await inFlight.value
      return
    }
    if (settled.value) return
    await load()
  }
  return { load, ready }
}

/**
 * Whether the signed-in User counts calories (CONTEXT.md — Calorie Tracking).
 *
 * App-wide state, not a per-page fetch: the navigation must render in its final
 * shape rather than dropping two tabs a moment after the page appears. A User who
 * has not chosen gets Tucker's full shape, and a read that fails leaves the
 * setting alone, so no failure silently removes half the app.
 *
 * `/profile` reads the same endpoint for its own form, so two reads can be in
 * flight at once on that page. Last write wins, deliberately: both are reading
 * the one row, so the only way they disagree is if one fails — and neither
 * writes on a failure.
 */
export function useCalorieTracking() {
  const { tracksCalories, readFrom } = useTrackingSetting()
  const { load, ready } = useSettledRead(useProfileRead(readFrom))
  return { tracksCalories, load, ready, readFrom }
}
