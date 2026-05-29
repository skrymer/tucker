import type { components } from '#open-fetch-schemas/api'

type ProfileDto = components['schemas']['ProfileDto']
type WeightMeasurement = components['schemas']['WeightMeasurementResponse']
type Goal = components['schemas']['GoalResponse']

export interface ProfileGating {
  /** The Weight log is interactive once a Profile exists. */
  weightEnabled: boolean
  /** The Goal section is interactive once a Profile and a weight reading exist. */
  goalEnabled: boolean
}

/**
 * Progressive-disclosure gating for the /profile screen — the single source of
 * truth for which sections are interactive.
 *
 * A pure function over the fetched aggregates, with no DOM coupling: the page
 * computes it from reactive state, but it can be unit-tested without rendering.
 *
 * `activeGoal` is part of the signature for call-site completeness but does not
 * gate anything — the Goal section is interactive whenever its prerequisites
 * (a Profile and at least one weight) are met, whether or not a Goal exists yet.
 */
export function useProfileGating(
  profile: ProfileDto | null,
  latestWeight: WeightMeasurement | null,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  activeGoal: Goal | null,
): ProfileGating {
  return {
    weightEnabled: profile !== null,
    goalEnabled: profile !== null && latestWeight !== null,
  }
}
