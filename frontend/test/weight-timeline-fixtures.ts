import type { components } from '#open-fetch-schemas/api'

type WeightTimelineResponse = components['schemas']['WeightTimelineResponse']
type WeightTimelineDayResponse =
  components['schemas']['WeightTimelineDayResponse']

/**
 * One day as the API sends it. `Required<…>` so a new field on the wire fails
 * typecheck here rather than leaving every call site quietly short of it.
 */
export function timelineDay(
  overrides: Partial<WeightTimelineDayResponse> = {},
): Required<WeightTimelineDayResponse> {
  return {
    date: '2026-06-03',
    weightKg: 80.4,
    trendKg: 80.2,
    caloriesKcal: null,
    calorieBudgetKcal: null,
    overBudget: null,
    trajectoryKg: null,
    ...overrides,
  }
}

/**
 * A run of consecutive days ending on `2026-06-03`, newest last. A weight given
 * as null is a day nobody weighed in on; the trend stands still through it, as
 * the backend carries it forward.
 */
export function timelineDays(
  weights: (number | null)[],
): Required<WeightTimelineDayResponse>[] {
  const last = new Date(Date.UTC(2026, 5, 3))
  let trend = 80.0
  return weights.map((weightKg, index) => {
    if (weightKg !== null) trend = Math.round((trend + 0.1) * 100) / 100
    const date = new Date(last)
    date.setUTCDate(date.getUTCDate() - (weights.length - 1 - index))
    return timelineDay({
      date: date.toISOString().slice(0, 10),
      weightKg,
      trendKg: trend,
    })
  })
}

/** A Weight Timeline as the API sends it. */
export function weightTimeline(
  overrides: Partial<WeightTimelineResponse> = {},
): Required<WeightTimelineResponse> {
  const days = overrides.days ?? timelineDays([80.4, 80.2, null, 80.1])
  return {
    from: days[0]!.date,
    to: days[days.length - 1]!.date,
    // Neither half named is Maintenance Mode — the shape a plain weight card is
    // drawn from. A test wanting the intake half says so; a plan names itself
    // from the days, so a fixture cannot express a drawn plan the response does
    // not admit to drawing. Override it for the case where a plan is the
    // evidence and no day in the window carries one (ADR 0029).
    loggedDays: null,
    planStartsOn: days.find((day) => day.trajectoryKg != null)?.date ?? null,
    ...overrides,
    days,
  }
}

/**
 * The same days given the active Goal's planned trajectory: [plan] positionally,
 * null on a day before the Goal was set. Never both this and [withIntake] — the
 * plan takes the intake half's place (ADR 0029).
 */
export function withPlan(
  days: Required<WeightTimelineDayResponse>[],
  plan: (number | null)[],
): Required<WeightTimelineDayResponse>[] {
  return days.map((day, index) => ({
    ...day,
    trajectoryKg: plan[index] ?? null,
  }))
}

/**
 * The same days given an intake half: [calories] positionally, null where nothing
 * was logged, all read against one [budgetKcal].
 */
export function withIntake(
  days: Required<WeightTimelineDayResponse>[],
  calories: (number | null)[],
  budgetKcal: number | null = 1800,
): Required<WeightTimelineDayResponse>[] {
  return days.map((day, index) => {
    const caloriesKcal = calories[index] ?? null
    return {
      ...day,
      caloriesKcal,
      calorieBudgetKcal: budgetKcal,
      // The backend states the verdict (ADR 0002); the fixture mirrors its rule.
      overBudget:
        caloriesKcal != null && budgetKcal != null
          ? caloriesKcal > budgetKcal
          : null,
    }
  })
}
