import { test, expect } from './support/smoke-test'
import { isoShiftDays, todayIso } from '../support/date'
import { create } from './support/seeding'
import {
  enterEstimate,
  enterGrams,
  openEstimateToLog,
  pickFoodToLog,
} from '../support/log-page'
import { toast } from '../support/toast'

// An Entry logged ahead for tomorrow (ADR 0035) is listed on Today under its own
// day and deleted from there, against the real backend — and one logged for
// tomorrow from Log, weighed or estimated, lands there. The first is seeded through the API,
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

test('a Weighed Entry logged for tomorrow from Log lands in the Tomorrow list', async ({
  page,
  goto,
  request,
}) => {
  // 4 × 13 + 4 × 67 + 9 × 7 = 383 kcal per 100 g, so 100 g is 383 kcal.
  const foodName = `Smoke oats ${Date.now()}`
  await create(request, '/foods', {
    tagIds: [],
    name: foodName,
    proteinPer100g: 13,
    carbsPer100g: 67,
    fatPer100g: 7,
  })

  await goto('/log', { waitUntil: 'hydration' })
  const sheet = await pickFoodToLog(page, {
    section: 'All foods',
    food: foodName,
  })
  await sheet.getByRole('radio', { name: /^Tomorrow · / }).click()
  await enterGrams(page, sheet, 100)
  await sheet.getByRole('button', { name: 'Log for tomorrow' }).click()

  await expect(sheet).toBeHidden()
  await expect(toast(page, 'Logged for tomorrow')).toContainText(
    `${foodName} — 100 g · 383 kcal · 13 g protein`,
  )

  await goto('/', { waitUntil: 'hydration' })
  const tomorrowsList = page.getByRole('region', { name: /^Tomorrow · / })
  await expect(tomorrowsList).toContainText('1 entry · 383 kcal')
  await expect(tomorrowsList).toContainText(foodName)
  // Nothing landed today, so today has no list at all.
  await expect(page.getByRole('region', { name: /^Today · / })).toBeHidden()
})

test('an estimate logged for tomorrow from Log lands in the Tomorrow list, flagged', async ({
  page,
  goto,
}) => {
  const label = `Smoke dinner ${Date.now()}`

  await goto('/log', { waitUntil: 'hydration' })
  const sheet = await openEstimateToLog(page)
  await sheet.getByRole('radio', { name: /^Tomorrow · / }).click()
  await enterEstimate(page, sheet, { label, calories: 640 })
  await sheet.getByRole('button', { name: 'Log estimate for tomorrow' }).click()

  await expect(sheet).toBeHidden()
  await expect(
    toast(page, 'Logged for tomorrow').getByText(`${label} — 640 kcal`, {
      exact: true,
    }),
  ).toBeVisible()

  await goto('/', { waitUntil: 'hydration' })
  const tomorrowsList = page.getByRole('region', { name: /^Tomorrow · / })
  await expect(tomorrowsList).toContainText('1 entry · 640 kcal')
  await expect(
    tomorrowsList.getByRole('listitem').filter({ hasText: label }),
  ).toContainText('est.')
  await expect(page.getByRole('region', { name: /^Today · / })).toBeHidden()
})
