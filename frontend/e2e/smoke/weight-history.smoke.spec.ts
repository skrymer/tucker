import type { APIRequestContext, Locator } from '@playwright/test'
import { test, expect } from './support/smoke-test'
import {
  calendarDayName,
  formatDayHeading as dayHeading,
  isoShiftDays,
  monthNameOf,
  todayIso,
} from '../support/date'
import { timelineLine } from '../support/weight-timeline'
import { expectCreated, expectStatus } from './support/seeding'

// "Weight history" against the real backend: a day missed inside the Weight
// Timeline's window is backfilled from the card, and the same reading then
// appears in the calendar and in the timeline above it. The per-test reset wipes
// the seed.
const API = 'http://localhost:8080/api'

/** Picks [iso] in [card]'s calendar, paging back a month first when it lies in the last one. */
async function pickDay(card: Locator, iso: string) {
  const month = `${monthNameOf(iso)} ${iso.slice(0, 4)}`
  if (!(await card.getByRole('button', { name: month }).isVisible())) {
    await card.getByRole('button', { name: 'Previous month' }).click()
  }
  await card.getByRole('button', { name: calendarDayName(iso) }).click()
}

/**
 * Three weeks of daily weighing up to [today], drifting down from 82 kg by
 * 0.05 kg a day, with no reading on [skip].
 */
async function seedDailyWeighing(
  request: APIRequestContext,
  today: string,
  skip?: string,
) {
  for (let back = 20; back >= 0; back--) {
    const on = isoShiftDays(today, -back)
    if (on === skip) continue
    await expectStatus(
      request.post(`${API}/weight`, {
        data: {
          date: on,
          weightKg: Number((82 - (20 - back) * 0.05).toFixed(1)),
          clientToday: today,
        },
      }),
      200,
    )
  }
}

/** The dot [card]'s calendar draws on [iso]: present only on a day holding a reading. */
function dotOn(card: Locator, iso: string) {
  return card
    .getByRole('button', { name: calendarDayName(iso) })
    .locator('[data-slot="base"]')
}

test('user backfills a missed day and sees it in the calendar and the Weight Timeline', async ({
  page,
  goto,
  request,
}) => {
  const today = todayIso()
  const missed = isoShiftDays(today, -10)

  await seedDailyWeighing(request, today, missed)

  await goto('/review', { waitUntil: 'hydration' })
  const card = page.getByRole('region', { name: 'Weight history' })
  const timeline = page.getByRole('region', { name: 'Your weight' })

  await expect(dotOn(card, isoShiftDays(today, -1))).toBeVisible()
  await pickDay(card, missed)
  await expect(
    card.getByText(`No weight on ${dayHeading(missed)}.`, { exact: true }),
  ).toBeVisible()
  await expect(dotOn(card, missed)).toHaveCount(0)

  await card.getByRole('button', { name: 'Add weight' }).click()
  const sheet = page.getByRole('dialog', { name: 'Log weight' })
  await sheet.getByLabel(/weight \(kg\)/i).fill('81.5')
  await page.keyboard.press('Tab')
  await sheet.getByRole('button', { name: 'Save weight' }).click()
  await expect(sheet).toBeHidden()

  await expect(card.getByText('81.5 kg')).toBeVisible()
  await expect(dotOn(card, missed)).toBeVisible()

  // The timeline above re-read without a reload: the backend's own figures for
  // the day, which now carries the reading.
  const to = today
  const from = isoShiftDays(to, -27)
  const drawn = await request.get(
    `${API}/weight-timeline?from=${from}&to=${to}`,
  )
  expect(drawn.status()).toBe(200)
  const { days } = (await drawn.json()) as {
    days: Parameters<typeof timelineLine>[0][]
  }
  const backfilled = days.find((day) => day.date === missed)!
  expect(backfilled.weightKg).toBe(81.5)
  await expect(
    timeline.getByText(timelineLine(backfilled, true)),
  ).toBeAttached()
})

test('user corrects a reading inside a reviewed week, and only the live trend follows', async ({
  page,
  goto,
  request,
}) => {
  const today = todayIso()
  const corrected = isoShiftDays(today, -2)

  await expectStatus(
    request.put(`${API}/profile`, {
      data: { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 },
    }),
    200,
  )
  // 81.1 kg on the corrected day.
  await seedDailyWeighing(request, today)
  await expectCreated(
    request.post(`${API}/goal`, {
      data: {
        startedOn: today,
        targetWeightKg: 75,
        rateKgPerWeek: 0.5,
        clientToday: today,
      },
    }),
  )

  // This week's review holds the trend as it stood.
  const reviewBefore = await (
    await request.post(`${API}/weekly-review?clientToday=${today}`)
  ).json()
  expect(reviewBefore.reviewedOn, 'the run crossed UTC midnight').toBe(today)
  const [goalBefore, progressBefore] = await Promise.all(
    ['goal', 'goal/progress'].map(async (path) =>
      (await request.get(`${API}/${path}`)).json(),
    ),
  )

  await goto('/review', { waitUntil: 'hydration' })
  const card = page.getByRole('region', { name: 'Weight history' })
  const timeline = page.getByRole('region', { name: 'Your weight' })
  const now = page
    .getByText('Now', { exact: true })
    .locator('xpath=following-sibling::dd')
  await expect(now).toHaveText(`${progressBefore.currentTrendKg.toFixed(1)} kg`)

  await pickDay(card, corrected)
  await expect(card.getByText('81.1 kg', { exact: true })).toBeVisible()
  await card
    .getByRole('button', { name: `Edit weight on ${dayHeading(corrected)}` })
    .click()
  const sheet = page.getByRole('dialog', { name: 'Log weight' })
  await expect(sheet.getByLabel(/weight \(kg\)/i)).toHaveValue('81.1')
  await sheet.getByLabel(/weight \(kg\)/i).fill('77.1')
  await page.keyboard.press('Tab')
  await sheet.getByRole('button', { name: 'Save weight' }).click()
  await expect(sheet).toBeHidden()

  // The day holds one reading, the corrected one.
  await expect(card.getByText('77.1 kg', { exact: true })).toBeVisible()
  await expect(card.getByText('81.1 kg', { exact: true })).toHaveCount(0)
  const readings = (await (await request.get(`${API}/weight`)).json()) as {
    measuredOn: string
    weightKg: number
  }[]
  expect(readings.filter((r) => r.measuredOn === corrected)).toEqual([
    expect.objectContaining({ weightKg: 77.1 }),
  ])

  // The timeline and the goal hero re-read without a reload, onto the moved trend.
  const from = isoShiftDays(today, -27)
  const { days } = (await (
    await request.get(`${API}/weight-timeline?from=${from}&to=${today}`)
  ).json()) as { days: Parameters<typeof timelineLine>[0][] }
  const correctedDay = days.find((day) => day.date === corrected)!
  expect(correctedDay.weightKg).toBe(77.1)
  await expect(
    timeline.getByText(timelineLine(correctedDay, true)),
  ).toBeAttached()
  const progressAfter = await (await request.get(`${API}/goal/progress`)).json()
  expect(progressAfter.currentTrendKg).toBeLessThan(
    progressBefore.currentTrendKg - 0.1,
  )
  await expect(now).toHaveText(`${progressAfter.currentTrendKg.toFixed(1)} kg`)

  // What was recorded before the correction states the trend as it was then.
  const [reviewAfter, goalAfter] = await Promise.all(
    ['weekly-review', 'goal'].map(async (path) =>
      (await request.get(`${API}/${path}`)).json(),
    ),
  )
  expect(reviewAfter.id).toBe(reviewBefore.id)
  expect(reviewAfter.trendWeightKg).toBe(reviewBefore.trendWeightKg)
  expect(goalAfter.startWeightKg).toBe(goalBefore.startWeightKg)
  expect(progressAfter.startWeightKg).toBe(goalBefore.startWeightKg)
})

test('user deletes a mistyped reading inside a reviewed week, and only the live trend follows', async ({
  page,
  goto,
  request,
}) => {
  const today = todayIso()
  const mistyped = isoShiftDays(today, -2)

  await expectStatus(
    request.put(`${API}/profile`, {
      data: { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 },
    }),
    200,
  )
  await seedDailyWeighing(request, today)
  // 71.1 typed for 81.1: a slip that drags the trend down a kilo.
  await expectStatus(
    request.post(`${API}/weight`, {
      data: { date: mistyped, weightKg: 71.1, clientToday: today },
    }),
    200,
  )
  await expectCreated(
    request.post(`${API}/goal`, {
      data: {
        startedOn: today,
        targetWeightKg: 70,
        rateKgPerWeek: 0.5,
        clientToday: today,
      },
    }),
  )

  // This week's review holds the trend as it stood, slip included.
  const reviewBefore = await (
    await request.post(`${API}/weekly-review?clientToday=${today}`)
  ).json()
  expect(reviewBefore.reviewedOn, 'the run crossed UTC midnight').toBe(today)
  const [goalBefore, progressBefore] = await Promise.all(
    ['goal', 'goal/progress'].map(async (path) =>
      (await request.get(`${API}/${path}`)).json(),
    ),
  )

  await goto('/review', { waitUntil: 'hydration' })
  const card = page.getByRole('region', { name: 'Weight history' })
  const timeline = page.getByRole('region', { name: 'Your weight' })
  const now = page
    .getByText('Now', { exact: true })
    .locator('xpath=following-sibling::dd')
  await expect(now).toHaveText(`${progressBefore.currentTrendKg.toFixed(1)} kg`)

  await pickDay(card, mistyped)
  await expect(card.getByText('71.1 kg', { exact: true })).toBeVisible()
  await card
    .getByRole('button', { name: `Delete weight on ${dayHeading(mistyped)}` })
    .click()
  const confirm = page.getByRole('dialog', { name: 'Delete this weight?' })
  await confirm.getByRole('button', { name: 'Delete' }).click()
  await expect(confirm).toBeHidden()

  // The day is empty again, on screen and in the store.
  await expect(
    card.getByText(`No weight on ${dayHeading(mistyped)}.`, { exact: true }),
  ).toBeVisible()
  await expect(card.getByRole('button', { name: 'Add weight' })).toBeVisible()
  await expect(dotOn(card, mistyped)).toHaveCount(0)
  await expect(dotOn(card, isoShiftDays(today, -1))).toBeVisible()
  const readings = (await (await request.get(`${API}/weight`)).json()) as {
    measuredOn: string
  }[]
  expect(readings.map((r) => r.measuredOn)).not.toContain(mistyped)
  expect(readings).toHaveLength(20)

  // The timeline and the goal hero re-read without a reload, onto the risen trend.
  const from = isoShiftDays(today, -27)
  const { days } = (await (
    await request.get(`${API}/weight-timeline?from=${from}&to=${today}`)
  ).json()) as { days: Parameters<typeof timelineLine>[0][] }
  const emptied = days.find((day) => day.date === mistyped)!
  expect(emptied.weightKg).toBeNull()
  await expect(timeline.getByText(timelineLine(emptied, true))).toBeAttached()
  const progressAfter = await (await request.get(`${API}/goal/progress`)).json()
  expect(progressAfter.currentTrendKg).toBeGreaterThan(
    progressBefore.currentTrendKg + 0.5,
  )
  await expect(now).toHaveText(`${progressAfter.currentTrendKg.toFixed(1)} kg`)

  // What was recorded before the delete states the trend as it was then.
  const [reviewAfter, goalAfter] = await Promise.all(
    ['weekly-review', 'goal'].map(async (path) =>
      (await request.get(`${API}/${path}`)).json(),
    ),
  )
  expect(reviewAfter.id).toBe(reviewBefore.id)
  expect(reviewAfter.trendWeightKg).toBe(reviewBefore.trendWeightKg)
  expect(goalAfter.startWeightKg).toBe(goalBefore.startWeightKg)
  expect(progressAfter.startWeightKg).toBe(goalBefore.startWeightKg)
})
