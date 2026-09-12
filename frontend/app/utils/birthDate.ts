import { localYearsAgo, localYesterday } from './date'

/**
 * Oldest a User can plausibly be — past this a birth date is a typo, not a life.
 *
 * The bound belongs to the domain (`Profile.capturedOn`); this states it to the
 * picker and to the form's Zod backstop. `profile-birth-date.smoke.spec.ts` holds
 * the two stacks in agreement by driving these days against the real API — the
 * two cannot import each other, so nothing else would fail on drift.
 */
export const MAX_AGE_YEARS = 120

/** The latest day a birth date may fall on — strictly in the past. */
export const latestBirthDate = () => localYesterday()

/** The earliest day a birth date may fall on — within a human lifetime. */
export const earliestBirthDate = () => localYearsAgo(MAX_AGE_YEARS)
