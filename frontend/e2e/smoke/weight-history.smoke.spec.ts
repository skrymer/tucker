import type { Locator } from '@playwright/test'
import { test, expect } from './support/smoke-test'
import {
  calendarDayName,
  formatDayHeading as dayHeading,
  isoShiftDays,
  monthNameOf,
  todayIso,
} from '../support/date'
import { timelineLine } from '../support/weight-timeline'
import { expectStatus } from './support/seeding'

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

  // Three weeks of daily weighing, one day short.
  for (let back = 20; back >= 0; back--) {
    const on = isoShiftDays(today, -back)
    if (on === missed) continue
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
  // Three weeks of daily weighing, drifting down from 82 kg: 81.1 kg on the
  // corrected day.
  for (let back = 20; back >= 0; back--) {
    await expectStatus(
      request.post(`${API}/weight`, {
        data: {
          date: isoShiftDays(today, -back),
          weightKg: Number((82 - (20 - back) * 0.05).toFixed(1)),
          clientToday: today,
        },
      }),
      200,
    )
  }
  await expectStatus(
    request.post(`${API}/goal`, {
      data: {
        startedOn: today,
        targetWeightKg: 75,
        rateKgPerWeek: 0.5,
        clientToday: today,
      },
    }),
    201,
  )

  // Opening Today fires this week's review, which holds the trend as it stood.
  await goto('/', { waitUntil: 'hydration' })
  const reviewBefore = await (await request.get(`${API}/weekly-review`)).json()
  expect(reviewBefore.reviewedOn, 'the run crossed UTC midnight').toBe(today)
  const goalBefore = await (await request.get(`${API}/goal`)).json()
  const progressBefore = await (
    await request.get(`${API}/goal/progress`)
  ).json()

  await goto('/review', { waitUntil: 'hydration' })
  const card = page.getByRole('region', { name: 'Weight history' })
  const timeline = page.getByRole('region', { name: 'Your weight' })
  const now = page
    .getByText('Now', { exact: true })
    .locator('xpath=following-sibling::dd')
  await expect(now).toHaveText(`${progressBefore.currentTrendKg.toFixed(1)} kg`)

  await pickDay(card, corrected)
  await expect(card.getByText('81.1 kg', { exact: true })).toBeVisible()
  await card.getByRole('button', { name: 'Edit' }).click()
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
  const reviewAfter = await (await request.get(`${API}/weekly-review`)).json()
  expect(reviewAfter.id).toBe(reviewBefore.id)
  expect(reviewAfter.trendWeightKg).toBe(reviewBefore.trendWeightKg)
  const goalAfter = await (await request.get(`${API}/goal`)).json()
  expect(goalAfter.startWeightKg).toBe(goalBefore.startWeightKg)
  expect(progressAfter.startWeightKg).toBe(goalBefore.startWeightKg)
})
