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
