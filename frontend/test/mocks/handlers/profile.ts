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

export const profileHandlers = [
  http.get('/api/profile', ({ response }) =>
    response(200).json(baselineProfile),
  ),
]
