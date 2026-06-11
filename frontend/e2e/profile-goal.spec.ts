import { expect, test } from './support/test'
import {
  mockProfile,
  mockWeightList,
  mockWeightTrend,
  mockGoals,
} from './support/mock-api'

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
  // The start is anchored on the live Trend Weight (ADR 0016), not the raw reading.
  await mockWeightTrend(page, { trendKg: 84.2, asOf: '2026-05-28' })
  await mockGoals(page, [], { currentTrendKg: 84.2 })

  await goto('/profile', { waitUntil: 'hydration' })

  const goal = page.getByRole('region', { name: /^goal$/i })

  // No active goal → Maintenance Mode: the creation form is behind the "Start a
  // goal" CTA. Opening it shows the starting trend weight (84.2 kg).
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

test('a target at or above the trend is rejected with a field error, no submit', async ({
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
  // The form validates the target against the trend it fetched (ADR 0016), so a
  // target at/above 84.0 is caught client-side — no request leaves the page.
  await mockWeightTrend(page, { trendKg: 84.0, asOf: '2026-05-28' })
  await mockGoals(page, [], { currentTrendKg: 84.0 })

  await goto('/profile', { waitUntil: 'hydration' })

  const goal = page.getByRole('region', { name: /^goal$/i })

  await goal.getByRole('button', { name: /start a goal/i }).click()
  await goal.getByLabel(/target weight/i).fill('84.5')
  await goal.getByLabel(/rate/i).fill('0.5')
  await goal.getByRole('button', { name: /^set goal$/i }).click()

  // The rejection surfaces as a field error, not a toast, and the form stays put.
  await expect(
    goal.getByText('Target must be below your start weight'),
  ).toBeVisible()
  await expect(goal.getByLabel(/target weight/i)).toBeVisible()
  await expect(
    goal.getByRole('button', { name: /set a new goal/i }),
  ).toHaveCount(0)
})

test('a backend-rejected target keeps the replacement form open and shows the error', async ({
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
  // The form's fetched trend (85.0) is momentarily stale: a reading logged after
  // it loaded moved the live trend to 84.0. So the client passes a target of 84.5
  // (< 85.0) that the backend re-derives against and rejects (ADR 0016) — the path
  // that must keep the form open rather than closing it optimistically.
  await mockWeightTrend(page, { trendKg: 85.0, asOf: '2026-05-28' })
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
    { currentTrendKg: 84.0 },
  )

  await goto('/profile', { waitUntil: 'hydration' })

  const goal = page.getByRole('region', { name: /^goal$/i })

  // The replacement form is behind "Set a new goal" until the user opens it.
  await goal.getByRole('button', { name: /set a new goal/i }).click()
  await goal.getByLabel(/target weight/i).fill('84.5')
  await goal.getByLabel(/rate/i).fill('0.5')
  await goal.getByRole('button', { name: /^set goal$/i }).click()

  // The form must not close optimistically on submit — otherwise the backend
  // rejection would have nowhere to render and the user would get no feedback.
  await expect(goal.getByText(/below your current trend weight/i)).toBeVisible()
  await expect(goal.getByLabel(/target weight/i)).toBeVisible()
})
