import { describe, expect, it } from 'vitest'
import type { components } from '#open-fetch-schemas/api'
import { useProfileGating } from './useProfileGating'

type ProfileDto = components['schemas']['ProfileDto']
type WeightMeasurement = components['schemas']['WeightMeasurementResponse']
type Goal = components['schemas']['GoalResponse']

const profile: ProfileDto = {
  sex: 'MALE',
  birthDate: '1990-06-15',
  heightCm: 180,
}
const weight: WeightMeasurement = {
  id: 1,
  measuredOn: '2026-05-29',
  weightKg: 84,
}
const goal: Goal = {
  id: 1,
  active: true,
  startedOn: '2026-05-29',
  startWeightKg: 84,
  targetWeightKg: 80,
  rateKgPerWeek: 0.5,
}

describe('useProfileGating', () => {
  it('disables both Weight and Goal when there is no profile', () => {
    expect(useProfileGating(null, null, null)).toEqual({
      weightEnabled: false,
      goalEnabled: false,
    })
  })

  it('enables Weight but not Goal when a profile exists with no weight yet', () => {
    expect(useProfileGating(profile, null, null)).toEqual({
      weightEnabled: true,
      goalEnabled: false,
    })
  })

  it('enables both Weight and Goal once a profile and a weight exist', () => {
    expect(useProfileGating(profile, weight, null)).toEqual({
      weightEnabled: true,
      goalEnabled: true,
    })
  })

  it('keeps both enabled when an active goal already exists — the goal does not gate', () => {
    expect(useProfileGating(profile, weight, goal)).toEqual({
      weightEnabled: true,
      goalEnabled: true,
    })
  })
})
