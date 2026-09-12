import type { components } from '#open-fetch-schemas/api'

type ProfileDto = components['schemas']['ProfileDto']

/**
 * Replaces the whole Profile — [patch] merged onto the loaded [current] — stamped
 * with the user's local day.
 *
 * A `PUT` is a whole-Profile replace, so both halves are load-bearing. The merge is
 * what stops one form's save clobbering the fields another owns. The day is what the
 * backend judges the carried-back birth date against (ADR 0014): omit it and the
 * server's clock decides, which differs from the user's for the width of a UTC offset.
 *
 * [current] is nullable because a first save has nothing to merge onto: the details
 * form is then setting a Profile up rather than editing one, and the backend fills
 * the fields it doesn't send from `ProfileDto`'s own defaults.
 *
 * The mutation wrapper stays with the caller — they differ in error title, success
 * side effect, and whether this write is nested inside a larger one.
 */
export function useProfileWrite() {
  const { $api } = useNuxtApp()

  return (current: ProfileDto | null, patch: Partial<ProfileDto> = {}) =>
    $api('/api/profile', {
      method: 'PUT',
      // The spec marks every field required, which is true of an edit and not of
      // that first save — the cast is the `current: null` case, and the backend
      // completes it from `ProfileDto`'s defaults rather than rejecting it.
      body: { ...current, ...patch } as ProfileDto,
      query: { clientToday: localToday() },
    })
}
