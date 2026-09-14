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
    ...overrides,
    days,
  }
}
