import { test, expect } from './support/smoke-test'
import { pickDate } from '../support/date-field'

// F4 slice 6 smoke: progressive disclosure on /profile against the real backend.
// No mocks.
//
// The Goal section keys off two signals: a Profile and at least one
// WeightMeasurement. Each smoke starts from a reset database (see
// support/smoke-test.ts), so we can deterministically walk the unlock from the
// empty state — saving the Profile alone leaves the Goal gated, and a weight
// logged on /review unlocks it (which, with no active Goal, lands in the F7
// maintenance state).

test('progressive disclosure unlocks Goal after a Profile and a weight logged on Review', async ({
  page,
  goto,
}) => {
  await goto('/profile', { waitUntil: 'hydration' })

  const goal = page.getByRole('region', { name: /^goal$/i })

  // Fresh DB: the Goal waits on a weight, and says where to log one.
  await expect(goal.getByText(/log your weight first/i)).toBeVisible()
  await expect(goal.getByRole('link', { name: 'Today' })).toBeVisible()
  await expect(page.getByRole('region', { name: /^weight$/i })).toHaveCount(0)

  // Save the Profile → Goal stays gated.
  await page.getByRole('radio', { name: /^male$/i }).click()
  await pickDate(page.getByLabel(/birth date/i), '1990-06-15')
  await page.getByLabel(/height/i).fill('180')
  await page.getByRole('button', { name: /save profile/i }).click()
  await expect(
    page.getByRole('heading', { name: /weekly-review reminder/i }),
  ).toBeVisible()
  await expect(goal.getByText(/log your weight first/i)).toBeVisible()

  // Log a weight on Review's Weight history → back on Profile the Goal section
  // is unlocked. With no active Goal it lands in the F7 maintenance state, whose
  // "Start a goal" CTA opens the creation form.
  await goto('/review', { waitUntil: 'hydration' })
  const history = page.getByRole('region', { name: 'Weight history' })
  await history.getByRole('button', { name: /add weight/i }).click()
  const sheet = page.getByRole('dialog', { name: /log weight/i })
  await sheet.getByLabel(/weight \(kg\)/i).fill('70.7')
  await page.keyboard.press('Tab')
  await sheet.getByRole('button', { name: /save weight/i }).click()
  await expect(sheet).toBeHidden()

  await goto('/profile', { waitUntil: 'hydration' })
  await expect(goal.getByText(/log your weight first/i)).toHaveCount(0)
  const startGoal = goal.getByRole('button', { name: /start a goal/i })
  await expect(startGoal).toBeVisible()
  await startGoal.click()
  await expect(goal.getByLabel(/target weight/i)).toBeVisible()
})
