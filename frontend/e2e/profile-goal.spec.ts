import { expect, test } from '@nuxt/test-utils/playwright'
import { mockProfile, mockWeightList, mockGoals } from './support/mock-api'

test('setting a goal on /profile replaces the form with the new goal card', async ({
  page,
  goto,
}) => {
  await mockProfile(page, {
    sex: 'MALE',
    birthDate: '1990-06-15',
    heightCm: 180,
  })
  await mockWeightList(page, [
    { id: 1, measuredOn: '2026-05-28', weightKg: 84.2 },
  ])
  await mockGoals(page, [])

  await goto('/profile', { waitUntil: 'hydration' })

  const goal = page.getByRole('region', { name: /^goal$/i })

  // No goal yet → the form is shown, anchored to the latest weight (84.2 kg).
  await expect(goal.getByText(/84\.2 kg/)).toBeVisible()
  await goal.getByLabel(/target weight/i).fill('80')
  await goal.getByLabel(/rate/i).fill('0.5')
  await goal.getByRole('button', { name: /^set goal$/i }).click()

  // The section refreshes to show the new active goal as a card, and the form
  // is gone behind the "Set a new goal" affordance.
  await expect(
    goal.getByRole('button', { name: /set a new goal/i }),
  ).toBeVisible()
  await expect(goal.getByText('80.0 kg')).toBeVisible()
  await expect(goal.getByText('0.5 kg/week')).toBeVisible()
  await expect(goal.getByLabel(/target weight/i)).toBeHidden()
})

test('a target not below the current trend weight is rejected with a field error', async ({
  page,
  goto,
}) => {
  await mockProfile(page, {
    sex: 'MALE',
    birthDate: '1990-06-15',
    heightCm: 180,
  })
  await mockWeightList(page, [
    { id: 1, measuredOn: '2026-05-28', weightKg: 85.0 },
  ])
  // The latest reading (85.0, the form's start weight) sits above the Trend Weight
  // (84.0), so a target of 84.5 clears the client start-weight rule yet is at/above
  // the trend — exactly the case the backend trend-weight guard catches (ADR 0008).
  await mockGoals(page, [], { rejectTargetAtOrAbove: 84.0 })

  await goto('/profile', { waitUntil: 'hydration' })

  const goal = page.getByRole('region', { name: /^goal$/i })

  await goal.getByLabel(/target weight/i).fill('84.5')
  await goal.getByLabel(/rate/i).fill('0.5')
  await goal.getByRole('button', { name: /^set goal$/i }).click()

  // The rejection surfaces as a field error naming the rule — not a generic toast,
  // and the form stays put so the user can correct the target.
  await expect(goal.getByText(/below your current trend weight/i)).toBeVisible()
  await expect(goal.getByLabel(/target weight/i)).toBeVisible()
  await expect(
    goal.getByRole('button', { name: /set a new goal/i }),
  ).toHaveCount(0)
})
