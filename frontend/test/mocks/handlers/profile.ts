import type { components } from '#open-fetch-schemas/api'
import { http, kotlinDouble, wrongDay } from '../http'

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
 * What `ProfileDto` fills in for a field a save leaves out — a first save from
 * the details form sends the body stats alone.
 */
const profileDefaults = {
  timezone: 'UTC',
  reminderHour: 9,
  remindersEnabled: false,
  tracksCalories: true,
}

/** Whether [zone] names an IANA zone, as `ZoneId.getAvailableZoneIds()` holds. */
function isKnownZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

/**
 * The ISO date [years] before [day], a 29 February landing on the 28th in a
 * year without one, as `LocalDate.minusYears` does.
 */
function minusYears(day: string, years: number): string {
  const year = Number(day.slice(0, 4)) - years
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  const monthDay = day.slice(5) === '02-29' && !leap ? '02-28' : day.slice(5)
  return `${String(year).padStart(4, '0')}-${monthDay}`
}

/**
 * A Profile that keeps what is saved to it — none yet, given null: [current]
 * reads what a save left, which is what a summary handler follows to carry the
 * review it recomputed. A save that says nothing of which day that recompute
 * is for is refused, where the backend would fall back to its own date:
 * standing in for a page that dropped the day it must send (ADR 0014).
 */
export function savedProfile(
  initial: Profile | null,
  guards: { today?: string; timezone?: string } = {},
) {
  let profile = initial
  return {
    current: () => profile,
    handlers: [
      http.get('/api/profile', ({ response }) =>
        profile === null
          ? response(404).json({ message: 'profile not set' })
          : response(200).json(profile),
      ),
      http.put('/api/profile', async ({ query, request, response }) => {
        const today = query.get('clientToday')
        if (!today) {
          return response(400).json({ message: 'clientToday is required' })
        }
        const notToday = wrongDay(today, guards.today)
        if (notToday) return response(400).json(notToday)
        const body = await request.json()
        // In `ProfileDto`'s own field order, as the backend writes it back.
        const saved: Profile = {
          sex: body.sex,
          birthDate: body.birthDate,
          heightCm: body.heightCm,
          timezone: body.timezone ?? profileDefaults.timezone,
          reminderHour: body.reminderHour ?? profileDefaults.reminderHour,
          remindersEnabled:
            body.remindersEnabled ?? profileDefaults.remindersEnabled,
          tracksCalories: body.tracksCalories ?? profileDefaults.tracksCalories,
        }
        if (saved.sex !== 'MALE' && saved.sex !== 'FEMALE') {
          return response(400).json({
            message: `No enum constant com.tucker.domain.Sex.${saved.sex}`,
          })
        }
        if (saved.heightCm <= 0) {
          return response(400).json({
            message: `heightCm must be > 0, was ${kotlinDouble(saved.heightCm)}`,
          })
        }
        if (saved.reminderHour < 0 || saved.reminderHour > 23) {
          return response(400).json({
            message: `reminderHour must be in 0..23, was ${saved.reminderHour}`,
          })
        }
        if (!isKnownZone(saved.timezone)) {
          return response(400).json({
            message: `timezone must be a known IANA zone, was '${saved.timezone}'`,
          })
        }
        if (saved.birthDate >= today) {
          return response(400).json({
            message: `birthDate must be in the past (was ${saved.birthDate}, today is ${today})`,
          })
        }
        if (saved.birthDate < minusYears(today, 120)) {
          return response(400).json({
            message: `birthDate must be within the last 120 years (was ${saved.birthDate}, today is ${today})`,
          })
        }
        if (guards.timezone && saved.timezone !== guards.timezone) {
          return response(400).json({
            message: `${saved.timezone} is not the zone this device reports`,
          })
        }
        profile = saved
        return response(200).json(saved)
      }),
    ],
  }
}

/** A Profile read as [profile], never saved. */
export function profileOf(profile: Profile) {
  return http.get('/api/profile', ({ response }) => response(200).json(profile))
}

export const profileHandlers = [profileOf(baselineProfile)]
