import type { components } from '#open-fetch-schemas/api'
import { http } from '../http'

type Profile = components['schemas']['ProfileDto']

/** A set-up adult who counts calories — Tucker's full shape. */
export const baselineProfile: Profile = {
  sex: 'MALE',
  birthDate: '1985-03-14',
  heightCm: 180,
  timezone: 'Australia/Brisbane',
  reminderHour: 19,
  remindersEnabled: false,
  tracksCalories: true,
}

/** The baseline User, having chosen to track weight alone. */
export const weightOnlyProfile: Profile = {
  ...baselineProfile,
  tracksCalories: false,
}

/**
 * A Profile that keeps what is saved to it: [current] reads what a save left,
 * which is what a summary handler follows to carry the review it recomputed.
 * A save is refused unless it says which day that recompute is for (ADR 0014).
 */
export function savedProfile(initial: Profile) {
  let profile = initial
  return {
    current: () => profile,
    handlers: [
      http.get('/api/profile', ({ response }) => response(200).json(profile)),
      http.put('/api/profile', async ({ query, request, response }) => {
        if (!query.get('clientToday')) {
          return response(400).json({ message: 'clientToday is required' })
        }
        profile = await request.json()
        return response(200).json(profile)
      }),
    ],
  }
}

/** A Profile read as [profile], never saved. */
export function profileOf(profile: Profile) {
  return http.get('/api/profile', ({ response }) => response(200).json(profile))
}

export const profileHandlers = [profileOf(baselineProfile)]
