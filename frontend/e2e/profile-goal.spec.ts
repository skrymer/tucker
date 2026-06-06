import { expect, test } from './support/test'
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

  // No active goal → Maintenance Mode: the creation form is behind the
  // "Start a goal" CTA. Opening it anchors the form to the latest weight (84.2 kg).
  await goal.getByRole('button', { name: /start a goal/i }).click()
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

  // No active goal → open the creation form from the maintenance CTA.
  await goal.getByRole('button', { name: /start a goal/i }).click()
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

test('replacing a goal with a rejected target keeps the form open and shows the error', async ({
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
  // An existing active goal, and the same latest-above-trend setup as above.
  await mockGoals(
    page,
    [
      {
        id: 9,
        startedOn: '2026-05-01',
        startWeightKg: 90,
        targetWeightKg: 80,
        rateKgPerWeek: 0.5,
        active: true,
      },
    ],
    { rejectTargetAtOrAbove: 84.0 },
  )

  await goto('/profile', { waitUntil: 'hydration' })

  const goal = page.getByRole('region', { name: /^goal$/i })

  // The replacement form is behind "Set a new goal" until the user opens it.
  await goal.getByRole('button', { name: /set a new goal/i }).click()
  await goal.getByLabel(/target weight/i).fill('84.5')
  await goal.getByLabel(/rate/i).fill('0.5')
  await goal.getByRole('button', { name: /^set goal$/i }).click()

  // The form must not close optimistically on submit — otherwise the rejection
  // would have nowhere to render and the user would get no feedback at all.
  await expect(goal.getByText(/below your current trend weight/i)).toBeVisible()
  await expect(goal.getByLabel(/target weight/i)).toBeVisible()
})
