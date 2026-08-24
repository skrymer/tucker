import type { components } from '#open-fetch-schemas/api'

/** Tucker counts calories unless the User has said otherwise (Profile.tracksCalories). */
export const DEFAULT_TRACKS_CALORIES = true

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
  const tracksCalories = useState(
    'tucker:tracks-calories',
    () => DEFAULT_TRACKS_CALORIES,
  )

  const { $api } = useNuxtApp()
  // `retry: 0` because the shell holds first paint on this read, and ofetch's
  // stock GET retry would double that wait for a failure that falls back anyway
  // (ADR 0007).
  const {
    data: profile,
    error,
    load: fetchProfile,
  } = useOptionalFetch(() => $api('/api/profile', { retry: 0 }))

  /** Take the setting from a Profile just read, or the default from its absence. */
  function readFrom(
    profile: Pick<components['schemas']['ProfileDto'], 'tracksCalories'> | null,
  ): void {
    tracksCalories.value = profile?.tracksCalories ?? DEFAULT_TRACKS_CALORIES
  }

  async function load(): Promise<void> {
    await fetchProfile()
    // A 404 — no Profile yet — is an expected empty state and leaves `error`
    // null, so it reads as the default. Anything else is a read that should have
    // worked: the setting is left as it stands rather than restated from a
    // failure, and the app quietly keeping its shape is not its only trace.
    if (error.value) {
      console.warn(
        'Could not read Calorie Tracking off the profile',
        error.value,
      )
      return
    }
    readFrom(profile.value)
  }

  return { tracksCalories, load, readFrom }
}
