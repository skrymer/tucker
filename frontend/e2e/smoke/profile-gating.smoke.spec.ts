import { test, expect } from './support/smoke-test'

// F4 slice 6 smoke: progressive disclosure on /profile against the real backend.
// No mocks.
//
// Gating keys off two signals: a Profile and at least one WeightMeasurement.
// Each smoke starts from a reset database (see support/smoke-test.ts), so we can
// deterministically walk the full unlock from the empty state — only Profile is
// interactive, saving it unlocks Weight, and logging a weight unlocks the Goal
// section (which, with no active Goal, lands in the F7 maintenance state).
const backfillDate = '2014-03-03'
const backfillKg = 70.7

test('progressive disclosure unlocks Weight after Profile and Goal after a weight', async ({
  page,
  goto,
}) => {
  await goto('/profile', { waitUntil: 'hydration' })

  const weight = page.getByRole('region', { name: /^weight$/i })
  const goal = page.getByRole('region', { name: /^goal$/i })

  // Fresh DB: only the Profile section is interactive.
  await expect(weight.getByText(/set your profile first/i)).toBeVisible()
  await expect(weight.getByRole('button', { name: /add weight/i })).toHaveCount(
    0,
  )
  await expect(goal.getByText(/log your weight first/i)).toBeVisible()

  // Save the Profile → Weight unlocks without a reload, Goal stays gated.
  await page.getByRole('radio', { name: /^male$/i }).click()
  await page.getByLabel(/birth date/i).fill('1990-06-15')
  await page.getByLabel(/height/i).fill('180')
  await page.getByRole('button', { name: /save profile/i }).click()

  await expect(
    weight.getByRole('button', { name: /add weight/i }),
  ).toBeVisible()
  await expect(weight.getByText(/set your profile first/i)).toHaveCount(0)
  await expect(goal.getByText(/log your weight first/i)).toBeVisible()

  // Log a weight → the Goal section unlocks without a reload. With no active
  // Goal it lands in the F7 maintenance state, whose "Start a goal" CTA opens
  // the creation form.
  await weight.getByRole('button', { name: /add weight/i }).click()
  const sheet = page.getByRole('dialog', { name: /log weight/i })
  await sheet.getByLabel(/date/i).fill(backfillDate)
  await sheet.getByLabel(/weight \(kg\)/i).fill(String(backfillKg))
  await sheet.getByRole('button', { name: /save weight/i }).click()
  await expect(sheet).toBeHidden()

  await expect(goal.getByText(/log your weight first/i)).toHaveCount(0)
  const startGoal = goal.getByRole('button', { name: /start a goal/i })
  await expect(startGoal).toBeVisible()
  await startGoal.click()
  await expect(goal.getByLabel(/target weight/i)).toBeVisible()
})
