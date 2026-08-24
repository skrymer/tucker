import { expect, type Locator } from '@playwright/test'
import { monthNameOf } from './date'

/**
 * Drive a `DateField` to an exact day the way a phone user has to: open it,
 * drill the heading down through the month view to the year grid, then pick
 * year, month, day.
 *
 * It never touches the day view's month control. Stepping one month at a time
 * is exactly what the year-first path exists to replace, so a helper that
 * quietly used it would stop proving the thing these specs are here for.
 */
export async function pickDate(trigger: Locator, iso: string) {
  const [year, , day] = iso.split('-').map(Number)
  const monthName = monthNameOf(iso)

  await trigger.click()
  const calendar = trigger
    .page()
    .getByRole('dialog', { name: /choose a date/i })

  await calendar.getByRole('button', { name: /^[A-Za-z]+ \d{4}$/ }).click()
  await calendar.getByRole('button', { name: /^\d{4}$/ }).click()

  // The year grid pages by a fixed span and only ever moves toward the target,
  // so the direction is decided once rather than re-read every iteration.
  const targetYear = calendar.getByRole('button', {
    name: String(year),
    exact: true,
  })
  const heading = await calendar
    .getByRole('button', { name: /^\d{4} - \d{4}$/ })
    .textContent()
  const step = calendar.getByRole('button', {
    name:
      year! < Number((heading ?? '').slice(0, 4))
        ? /previous year/i
        : /next year/i,
  })
  // Retrying, not a bare isVisible(): an immediate check can read the DOM
  // before the new grid renders, and since the direction is fixed the helper
  // would page past the target and never come back.
  for (let i = 0; i < 20; i++) {
    if (await targetYear.isVisible()) break
    await step.click()
    await expect(
      calendar.getByRole('button', { name: /^\d{4} - \d{4}$/ }),
    ).toBeVisible()
  }

  await targetYear.click()
  await calendar
    .getByRole('button', { name: `${monthName} ${year}`, exact: true })
    .click()
  await calendar
    .getByRole('button', { name: new RegExp(`${monthName} ${day}, ${year}$`) })
    .click()
}
