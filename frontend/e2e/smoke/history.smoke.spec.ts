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

// "History" against the real backend: a day missed inside the Weight
// Timeline's window is backfilled from the card, and the same reading then
// appears in the calendar and in the timeline above it; Entries seeded on two
// past days are read back a day at a time. The per-test reset wipes the seed.
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

/** The ring [card]'s calendar draws on [iso]: present only on a day holding a reading. */
function ringOn(card: Locator, iso: string) {
  return card
    .getByRole('button', { name: calendarDayName(iso) })
    .locator('[data-mark="weigh-in"]')
}

/** The dot [card]'s calendar draws on [iso]: present only on a day holding an Entry. */
function dotOn(card: Locator, iso: string) {
  return card
    .getByRole('button', { name: calendarDayName(iso) })
    .locator('[data-mark="entries"]')
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
  const card = page.getByRole('region', { name: 'History' })
  const timeline = page.getByRole('region', { name: 'Your weight' })

  await expect(ringOn(card, isoShiftDays(today, -1))).toBeVisible()
  await pickDay(card, missed)
  await expect(card.getByText('No weight.', { exact: true })).toBeVisible()
  await expect(ringOn(card, missed)).toHaveCount(0)

  await card.getByRole('button', { name: 'Add weight' }).click()
  const sheet = page.getByRole('dialog', { name: 'Log weight' })
  await sheet.getByLabel(/weight \(kg\)/i).fill('81.5')
  await page.keyboard.press('Tab')
  await sheet.getByRole('button', { name: 'Save weight' }).click()
  await expect(sheet).toBeHidden()

  await expect(card.getByText('81.5 kg')).toBeVisible()
  await expect(ringOn(card, missed)).toBeVisible()

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
  const card = page.getByRole('region', { name: 'History' })
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
  const card = page.getByRole('region', { name: 'History' })
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
  await expect(card.getByText('No weight.', { exact: true })).toBeVisible()
  await expect(card.getByRole('button', { name: 'Add weight' })).toBeVisible()
  await expect(ringOn(card, mistyped)).toHaveCount(0)
  await expect(ringOn(card, isoShiftDays(today, -1))).toBeVisible()
  const from = isoShiftDays(today, -27)
  const [readings, { days }, progressAfter] = (await Promise.all(
    ['weight', `weight-timeline?from=${from}&to=${today}`, 'goal/progress'].map(
      async (path) => (await request.get(`${API}/${path}`)).json(),
    ),
  )) as [
    { measuredOn: string }[],
    { days: Parameters<typeof timelineLine>[0][] },
    { currentTrendKg: number; startWeightKg: number },
  ]
  expect(readings.map((r) => r.measuredOn)).not.toContain(mistyped)
  expect(readings).toHaveLength(20)

  // The timeline and the goal hero re-read without a reload, onto the risen trend.
  const emptied = days.find((day) => day.date === mistyped)!
  expect(emptied.weightKg).toBeNull()
  await expect(timeline.getByText(timelineLine(emptied, true))).toBeAttached()
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

test('user deletes the only reading under an active Goal, and the Goal asks for a weight rather than showing a trend', async ({
  page,
  goto,
  request,
}) => {
  const today = todayIso()
  await expectStatus(
    request.put(`${API}/profile`, {
      data: { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 },
    }),
    200,
  )
  await expectStatus(
    request.post(`${API}/weight`, {
      data: { date: today, weightKg: 84.6, clientToday: today },
    }),
    200,
  )
  await expectCreated(
    request.post(`${API}/goal`, {
      data: {
        startedOn: today,
        targetWeightKg: 78,
        rateKgPerWeek: 0.5,
        clientToday: today,
      },
    }),
  )

  await goto('/review', { waitUntil: 'hydration' })
  const card = page.getByRole('region', { name: 'History' })
  await card
    .getByRole('button', { name: `Delete weight on ${dayHeading(today)}` })
    .click()
  const confirm = page.getByRole('dialog', { name: 'Delete this weight?' })
  await confirm.getByRole('button', { name: 'Delete' }).click()
  await expect(confirm).toBeHidden()

  await expect(card.getByText('No weight.', { exact: true })).toBeVisible()
  await expect(
    page.getByText('Log a weight to see where you stand on your Goal.'),
  ).toBeVisible()
  await expect(page.getByText('Now', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('progressbar')).toHaveCount(0)
})

test('user looks up a past day, sees its Entries and tally, then an unlogged day', async ({
  page,
  goto,
  request,
}) => {
  const today = todayIso()
  const older = isoShiftDays(today, -4)
  const unlogged = isoShiftDays(today, -3)
  const recent = isoShiftDays(today, -2)
  const stamp = Date.now()

  for (const [date, label, calories, protein] of [
    [older, `Older ${stamp}`, 400, 20],
    [recent, `Lunch ${stamp}`, 650, 35],
    [recent, `Dinner ${stamp}`, 538, 41],
  ] as const) {
    await expectCreated(
      request.post(`${API}/entries/estimated`, {
        data: { date, label, calories, protein },
      }),
    )
  }

  await goto('/review', { waitUntil: 'hydration' })
  const card = page.getByRole('region', { name: 'History' })

  await pickDay(card, recent)
  const day = card
    .getByRole('region', { name: dayHeading(recent) })
    .getByRole('region', { name: 'Entries' })
  await expect(day.getByText('2 entries · 1,188 kcal')).toBeVisible()
  const rows = day.getByRole('listitem')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText(`Lunch ${stamp}`)
  await expect(rows.nth(0)).toContainText('650 kcal · 35 g protein')
  await expect(rows.nth(1)).toContainText(`Dinner ${stamp}`)
  await expect(rows.nth(1)).toContainText('538 kcal · 41 g protein')
  await expect(day.getByText(`Older ${stamp}`)).toBeHidden()
  await expect(dotOn(card, recent)).toBeVisible()
  await expect(ringOn(card, recent)).toHaveCount(0)

  await pickDay(card, unlogged)
  const empty = card
    .getByRole('region', { name: dayHeading(unlogged) })
    .getByRole('region', { name: 'Entries' })
  await expect(
    empty.getByText('Nothing logged.', { exact: true }),
  ).toBeVisible()
  await expect(empty.getByRole('listitem')).toHaveCount(0)
  await expect(dotOn(card, unlogged)).toHaveCount(0)

  await pickDay(card, older)
  await expect(dotOn(card, older)).toBeVisible()
})
