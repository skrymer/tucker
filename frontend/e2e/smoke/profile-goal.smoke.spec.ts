import { test, expect } from '@nuxt/test-utils/playwright'

// F4 slice 4 smoke: the full UI → API → DB path for setting a Goal on
// /profile, and the first Goal auto-firing the weekly review so the dashboard
// gains a real Calorie Budget and Protein Floor. No mocks.
//
// Profile and a weight reading are prerequisites for the Goal form (start
// weight) and the auto-fired review, so we seed them through the API first —
// both are idempotent upserts, so they leave the docker volume clean. The Goal
// itself is submitted through the UI (the slice's surface). A Goal can't be
// deleted (replacement-only, no DELETE), but each run replaces the active Goal
// rather than accumulating state that changes the asserted outcome.
const API = 'http://localhost:8080/api'

test('setting a goal on /profile yields a non-null budget on the dashboard', async ({
  page,
  goto,
  request,
}) => {
  const today = new Date().toLocaleDateString('en-CA')

  // Prerequisites via the API: a profile and a current weight reading.
  const profile = await request.put(`${API}/profile`, {
    data: { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 },
  })
  expect(profile.ok()).toBe(true)

  const weight = await request.post(`${API}/weight`, {
    data: { date: today, weightKg: 85 },
  })
  expect(weight.ok()).toBe(true)

  await goto('/profile', { waitUntil: 'hydration' })

  const goal = page.getByRole('region', { name: /^goal$/i })
  await expect(goal).toBeVisible()

  // If an active goal already exists (a prior run), open the form to replace it;
  // otherwise the form is already shown.
  const setNewGoal = goal.getByRole('button', { name: /set a new goal/i })
  if (await setNewGoal.isVisible()) await setNewGoal.click()

  await goal.getByLabel(/target weight/i).fill('80')
  await goal.getByLabel(/rate/i).fill('0.5')
  await goal.getByRole('button', { name: /^set goal$/i }).click()

  // The new active goal shows as a card.
  await expect(
    goal.getByRole('button', { name: /set a new goal/i }),
  ).toBeVisible()
  await expect(goal.getByText('80.0 kg')).toBeVisible()
  await expect(goal.getByText('0.5 kg/week')).toBeVisible()

  // The first Goal fired the weekly review, so the dashboard now has a budget.
  await expect
    .poll(async () => {
      const res = await request.get(`${API}/summary?date=${today}`)
      if (!res.ok()) return null
      return (await res.json()) as {
        calorieBudget: number | null
        proteinFloor: number | null
      }
    })
    .toEqual(
      expect.objectContaining({
        calorieBudget: expect.any(Number),
        proteinFloor: expect.any(Number),
      }),
    )

  // And the /today dashboard renders those numbers (no setup nudge).
  await goto('/', { waitUntil: 'hydration' })
  await expect(
    page.getByText(/finish setup to see your calorie budget/i),
  ).toHaveCount(0)
})
