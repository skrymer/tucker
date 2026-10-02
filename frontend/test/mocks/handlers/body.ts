import type { components } from '#open-fetch-schemas/api'
import { DAY_MS, http, kotlinDouble, wrongDay } from '../http'
import { savedProfile } from './profile'

type Profile = components['schemas']['ProfileDto']
type Reading = components['schemas']['WeightMeasurementResponse']
type Goal = components['schemas']['GoalResponse']
type Trend = components['schemas']['WeightTrendResponse']

/** A Goal as it is stored: its daily deficit is derived, never seeded. */
export type StoredGoal = Omit<Goal, 'dailyDeficitKcal'>

/** kcal in a kilogram of body fat (`Goal.KCAL_PER_KG_FAT`). */
const KCAL_PER_KG_FAT = 7700

/** The share of each reading the trend takes in, per day (`WeightTrend.SMOOTHING`). */
const SMOOTHING = 0.1

/** [readings] by the day they were taken, as `ORDER BY measured_on` lists them. */
const oldestFirst = (readings: Reading[]) =>
  [...readings].sort((a, b) => a.measuredOn.localeCompare(b.measuredOn))

/**
 * The live Trend Weight over [readings], as `WeightTrend.from` smooths it:
 * oldest first, the decay compounded over the days between readings, in the
 * backend's order of operations so it sends the same double. Null with none.
 */
function trendOf(readings: Reading[]): Trend | null {
  let trend: Trend | null = null
  for (const { measuredOn, weightKg } of oldestFirst(readings)) {
    if (trend === null) {
      trend = { trendKg: weightKg, asOf: measuredOn }
      continue
    }
    const gapDays: number =
      (Date.parse(measuredOn) - Date.parse(trend.asOf)) / DAY_MS
    const retained: number = (1 - SMOOTHING) ** gapDays
    trend = {
      trendKg: (1 - retained) * weightKg + retained * trend.trendKg,
      asOf: measuredOn,
    }
  }
  return trend
}

/** Whole years from [birthDate] to [on], both ISO dates (`Profile.ageOn`). */
function ageOn(birthDate: string, on: string): number {
  const years = Number(on.slice(0, 4)) - Number(birthDate.slice(0, 4))
  return on.slice(5) < birthDate.slice(5) ? years - 1 : years
}

/**
 * The Maintenance a Goal's rate is judged against on [today]: nothing is
 * logged here and no review exists to hold, so it is a cold start — the
 * Mifflin-St Jeor seed for [profile] at the live [trend], times the activity
 * factor (`WeeklyReviewService.maintenanceFor`, `Maintenance.seed`). Null with
 * Calorie Tracking off, when no review derives one.
 */
function seededMaintenance(
  profile: Profile | null,
  trend: Trend,
  today: string,
): number | null {
  if (!profile?.tracksCalories) return null
  const base =
    10 * trend.trendKg +
    6.25 * profile.heightCm -
    5 * ageOn(profile.birthDate, today)
  const bmr = profile.sex === 'MALE' ? base + 5 : base - 161
  return bmr * 1.4
}

/** A rate as the User typed it — "1.5", not "1.50" (`GoalService.plainRate`). */
const plainRate = (rate: number) =>
  rate.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')

/**
 * One User's body and plan, kept as the backend keeps them: the Profile (null
 * for none yet), the Weight Measurements and the Goals, each read back as the
 * last save left it. Answers the Profile, the readings (the list, the latest,
 * the trend and a save), and the Goal history, the active Goal and a new one;
 * Goal Progress stays the baseline's.
 *
 * Given [today], a save stamped with any other day is refused, standing in for
 * a page that sent the wrong one (ADR 0014); [timezone] does the same for the
 * Profile's zone (`savedProfile`).
 */
export function bodyAndPlan(seed: {
  profile: Profile | null
  readings?: Reading[]
  goals?: StoredGoal[]
  today?: string
  timezone?: string
}) {
  const profile = savedProfile(seed.profile, {
    today: seed.today,
    timezone: seed.timezone,
  })
  const readings = [...(seed.readings ?? [])]
  let nextId = Math.max(0, ...readings.map((r) => r.id)) + 1
  const goals = (seed.goals ?? []).map((goal) => ({ ...goal }))
  let nextGoalId = Math.max(0, ...goals.map((g) => g.id)) + 1
  const described = (goal: StoredGoal): Goal => ({
    ...goal,
    dailyDeficitKcal: (goal.rateKgPerWeek * KCAL_PER_KG_FAT) / 7,
  })
  return [
    ...profile.handlers,
    http.get('/api/goal', ({ response }) => {
      const active = goals.find((g) => g.active)
      return active
        ? response(200).json(described(active))
        : response(404).json({ message: 'no active Goal' })
    }),
    http.get('/api/goals', ({ response }) =>
      response(200).json(
        [...goals]
          .sort((a, b) => b.startedOn.localeCompare(a.startedOn) || b.id - a.id)
          .map(described),
      ),
    ),
    http.post('/api/goal', async ({ request, response }) => {
      const { startedOn, targetWeightKg, rateKgPerWeek, clientToday } =
        await request.json()
      const notToday = wrongDay(clientToday, seed.today)
      if (notToday) return response(400).json(notToday)
      const trend = trendOf(readings)
      if (trend === null) {
        return response(400).json({
          message: 'log your weight before setting a goal',
        })
      }
      if (targetWeightKg >= trend.trendKg) {
        return response(400).json({
          message: `a weight-loss Goal needs a target below your current trend weight (${trend.trendKg.toFixed(1)} kg)`,
          field: 'targetWeightKg',
        })
      }
      if (clientToday && startedOn > clientToday) {
        return response(400).json({
          message: `a Goal cannot start in the future (was ${startedOn}, today is ${clientToday})`,
        })
      }
      if (targetWeightKg <= 0) {
        return response(400).json({ message: 'targetWeightKg must be > 0' })
      }
      if (rateKgPerWeek < 0.05 || rateKgPerWeek > 1.5) {
        return response(400).json({
          message: 'rateKgPerWeek must be between 0.05 and 1.5 kg/week',
        })
      }
      const maintenance = seededMaintenance(
        profile.current(),
        trend,
        // The backend falls back to its own date; the page always sends one.
        clientToday ?? seed.today ?? trend.asOf,
      )
      if (
        maintenance !== null &&
        (rateKgPerWeek * KCAL_PER_KG_FAT) / 7 >= maintenance
      ) {
        return response(400).json({
          message:
            `at your current maintenance of ${maintenance.toFixed(0)} kcal a day, ` +
            `${plainRate(rateKgPerWeek)} kg a week would leave you nothing to eat ` +
            '— choose a slower rate',
          field: 'rateKgPerWeek',
        })
      }
      for (const goal of goals) goal.active = false
      const created: StoredGoal = {
        id: nextGoalId++,
        startedOn,
        startWeightKg: trend.trendKg,
        targetWeightKg,
        rateKgPerWeek,
        active: true,
        reachedOn: null,
      }
      goals.push(created)
      return response(201).json(described(created))
    }),
    http.get('/api/weight', ({ response }) =>
      response(200).json(oldestFirst(readings)),
    ),
    http.get('/api/weight/latest', ({ response }) => {
      const latest = oldestFirst(readings).at(-1)
      return latest
        ? response(200).json(latest)
        : response(404).json({ message: 'no weight measurements recorded yet' })
    }),
    http.post('/api/weight', async ({ request, response }) => {
      const { date, weightKg, clientToday } = await request.json()
      const notToday = wrongDay(clientToday, seed.today)
      if (notToday) return response(400).json(notToday)
      if (clientToday && date > clientToday) {
        return response(400).json({
          message: `measuredOn must not be in the future (was ${date}, today is ${clientToday})`,
        })
      }
      if (weightKg <= 0) {
        return response(400).json({
          message: `weightKg must be > 0, was ${kotlinDouble(weightKg)}`,
        })
      }
      const sameDay = readings.find((r) => r.measuredOn === date)
      const saved = { id: sameDay?.id ?? nextId++, measuredOn: date, weightKg }
      if (sameDay) readings.splice(readings.indexOf(sameDay), 1, saved)
      else readings.push(saved)
      // Reaching latches: only an active Goal not yet reached is stamped.
      const active = goals.find((g) => g.active && g.reachedOn === null)
      const trend = trendOf(readings)
      if (active && trend && trend.trendKg <= active.targetWeightKg) {
        active.reachedOn = clientToday ?? seed.today ?? null
      }
      return response(200).json(saved)
    }),
    http.get('/api/weight/trend', ({ response }) => {
      const trend = trendOf(readings)
      return trend === null
        ? response(404).json({ message: 'no weight measurements recorded yet' })
        : response(200).json(trend)
    }),
  ]
}
