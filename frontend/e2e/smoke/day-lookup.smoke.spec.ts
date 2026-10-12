import type { Locator } from '@playwright/test'
import { test, expect } from './support/smoke-test'
import {
  calendarDayName,
  formatDayHeading as dayHeading,
  isoShiftDays,
  monthNameOf,
  todayIso,
} from '../support/date'
import { expectCreated } from './support/seeding'

// "Look up a day" against the real backend: Entries seeded on two past days are
// read back a day at a time through the existing day read, and a day between
// them that holds nothing says so. The per-test reset wipes the seed.
const API = 'http://localhost:8080/api'

/** Picks [iso] in [card]'s calendar, paging back a month first when it lies in the last one. */
async function pickDay(card: Locator, iso: string) {
  // A previous month's days show only as the grid's spill-over, if at all.
  const month = `${monthNameOf(iso)} ${iso.slice(0, 4)}`
  if (!(await card.getByRole('button', { name: month }).isVisible())) {
    await card.getByRole('button', { name: 'Previous month' }).click()
  }
  await card.getByRole('button', { name: calendarDayName(iso) }).click()
}

/** The dot [card]'s calendar draws on [iso]: present only on a day holding an Entry. */
function dotOn(card: Locator, iso: string) {
  return card
    .getByRole('button', { name: calendarDayName(iso) })
    .locator('[data-slot="base"]')
}

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
  const card = page.getByRole('region', { name: 'Look up a day' })

  await pickDay(card, recent)
  const day = card.getByRole('region', { name: dayHeading(recent) })
  await expect(day.getByText('2 entries · 1,188 kcal')).toBeVisible()
  const rows = day.getByRole('listitem')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText(`Lunch ${stamp}`)
  await expect(rows.nth(0)).toContainText('650 kcal · 35 g protein')
  await expect(rows.nth(1)).toContainText(`Dinner ${stamp}`)
  await expect(rows.nth(1)).toContainText('538 kcal · 41 g protein')
  await expect(day.getByText(`Older ${stamp}`)).toBeHidden()
  await expect(dotOn(card, recent)).toBeVisible()

  await pickDay(card, unlogged)
  const empty = card.getByRole('region', { name: dayHeading(unlogged) })
  await expect(
    empty.getByText(`Nothing logged on ${dayHeading(unlogged)}.`, {
      exact: true,
    }),
  ).toBeVisible()
  await expect(empty.getByRole('listitem')).toHaveCount(0)
  await expect(dotOn(card, unlogged)).toHaveCount(0)

  await pickDay(card, older)
  await expect(dotOn(card, older)).toBeVisible()
})
