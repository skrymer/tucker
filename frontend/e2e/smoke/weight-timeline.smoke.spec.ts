import type { APIRequestContext } from '@playwright/test'
import { test, expect } from './support/smoke-test'
import { isoShiftDays, todayIso } from '../support/date'
import { timelineLine } from '../support/weight-timeline'

// F17 slice 1 smoke: a Weight Timeline against the real backend. Seeds forty days
// of readings over the API, asserts what the endpoint draws — the trend is the
// backend's alone (ADR 0002) — then reads the same figures back off `/review`
// and widens the window. The per-test reset wipes the seed, so there is no
// cleanup.
const API = 'http://localhost:8080/api'

type TimelineDay = { date: string; weightKg: number | null; trendKg: number }

async function weighIn(
  request: APIRequestContext,
  on: string,
  weightKg: number,
  today: string,
) {
  const saved = await request.post(`${API}/weight`, {
    data: { date: on, weightKg, clientToday: today },
  })
  expect(saved.status()).toBe(200)
}

async function timeline(
  request: APIRequestContext,
  days: number,
  today: string,
) {
  const to = today
  const from = isoShiftDays(to, -(days - 1))
  const response = await request.get(
    `${API}/weight-timeline?from=${from}&to=${to}`,
  )
  expect(response.status()).toBe(200)
  return (await response.json()) as {
    from: string
    to: string
    days: TimelineDay[]
  }
}

test('the timeline draws the readings behind the trend, and widens to 90 days', async ({
  page,
  goto,
  request,
}) => {
  const today = todayIso()
  const HISTORY = 40
  const SKIPPED = isoShiftDays(today, -10)

  // Forty days of daily weighing, half a kilo a week off, with one day missed
  // inside the 28-day window — the day that must reach the chart as an absence.
  for (let back = HISTORY - 1; back >= 0; back--) {
    const on = isoShiftDays(today, -back)
    if (on === SKIPPED) continue
    await weighIn(
      request,
      on,
      Number((82 - (HISTORY - 1 - back) * 0.05).toFixed(1)),
      today,
    )
  }

  const fourWeeks = await timeline(request, 28, today)
  expect(fourWeeks.from).toBe(isoShiftDays(today, -27))
  expect(fourWeeks.days).toHaveLength(28)
  expect(
    fourWeeks.days.find((day) => day.date === SKIPPED)?.weightKg,
  ).toBeNull()

  await goto('/review', { waitUntil: 'hydration' })

  const section = page.getByRole('region', { name: 'Your weight' })
  await expect(section.getByRole('listitem')).toHaveCount(28)
  // The figures on screen are the ones the endpoint drew — the trend is smoothed
  // over the User's whole history by the backend and never re-derived here.
  await expect(
    section.getByText(timelineLine(fourWeeks.days.at(-1)!)),
  ).toBeAttached()
  await expect(
    section.getByText(
      timelineLine(fourWeeks.days.find((d) => d.date === SKIPPED)!),
    ),
  ).toBeAttached()

  await section.getByRole('tab', { name: '90 days' }).click()

  // Cut to where the readings start rather than padded back ninety days.
  const threeMonths = await timeline(request, 90, today)
  expect(threeMonths.from).toBe(isoShiftDays(today, -(HISTORY - 1)))
  await expect(section.getByRole('listitem')).toHaveCount(HISTORY)
  await expect(
    section.getByText(timelineLine(threeMonths.days[0]!)),
  ).toBeAttached()
})
