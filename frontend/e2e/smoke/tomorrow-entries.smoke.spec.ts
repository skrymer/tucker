import { test, expect } from './support/smoke-test'
import { isoShiftDays, todayIso } from '../support/date'
import { create } from './support/seeding'

// An Entry logged ahead for tomorrow (ADR 0035) is listed on Today under its own
// day and deleted from there, against the real backend. Seeded through the API,
// which accepts a tomorrow date. The per-test reset wipes the seed.

test("a tomorrow Entry is listed apart from today's and can be deleted", async ({
  page,
  goto,
  request,
}) => {
  const today = todayIso()
  const stamp = Date.now()
  const lunch = `Lunch ${stamp}`
  const prepped = `Prepped ${stamp}`

  for (const [date, label, calories] of [
    [today, lunch, 450],
    [isoShiftDays(today, 1), prepped, 620],
  ] as const) {
    await create(request, '/entries/estimated', {
      date,
      label,
      calories,
      protein: null,
    })
  }

  await goto('/', { waitUntil: 'hydration' })

  const todaysList = page.getByRole('region', { name: /^Today · / })
  const tomorrowsList = page.getByRole('region', { name: /^Tomorrow · / })
  await expect(todaysList).toContainText('1 entry · 450 kcal')
  await expect(todaysList).toContainText(lunch)
  await expect(todaysList).not.toContainText(prepped)
  await expect(tomorrowsList).toContainText('1 entry · 620 kcal')
  await expect(tomorrowsList).toContainText(prepped)

  await tomorrowsList
    .getByRole('button', { name: `Delete ${prepped} — 620 kcal` })
    .click()
  const confirm = page.getByRole('dialog', { name: /delete this entry/i })
  await confirm.getByRole('button', { name: /^delete$/i }).click()

  // Tomorrow's only Entry gone, so its list goes with it; today is untouched.
  await expect(confirm).toBeHidden()
  await expect(tomorrowsList).toBeHidden()
  await expect(todaysList).toContainText('1 entry · 450 kcal')
  await expect(todaysList).toContainText(lunch)
})
