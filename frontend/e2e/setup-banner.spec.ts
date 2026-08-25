import { expect, test } from './support/test'
import { mockProfile, mockSummary, mockWeightApi } from './support/mock-api'

test('the Today page nudges the user to finish setup when there is no budget', async ({
  page,
  goto,
}) => {
  await mockWeightApi(page)
  // The default mocked summary is the pre-setup state: setupComplete false.
  await mockSummary(page)

  await goto('/', { waitUntil: 'hydration' })

  await expect(
    page.getByText(/finish setup to see your calorie budget/i),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: /finish setup/i }),
  ).toHaveAttribute('href', '/profile')
})

test('the Today page hides the setup nudge once setup is complete', async ({
  page,
  goto,
}) => {
  await mockWeightApi(page)
  await mockSummary(page, {
    date: '2026-05-22',
    caloriesConsumed: 0,
    proteinConsumed: 0,
    estimatedCalorieShare: 0,
    setupComplete: true,
    calorieBudget: 2000,
    proteinFloor: 140,
    caloriesRemaining: 2000,
    dayStatus: 'in-progress',
    entries: [],
  })

  await goto('/', { waitUntil: 'hydration' })

  await expect(
    page.getByText(/finish setup to see your calorie budget/i),
  ).toHaveCount(0)
})

test('the Today page asks a weight-only user for their first weight, not for a budget', async ({
  page,
  goto,
}) => {
  await mockWeightApi(page)
  await mockProfile(page, {
    sex: 'MALE',
    birthDate: '1990-06-15',
    heightCm: 180,
    tracksCalories: false,
  })
  // Setup genuinely unfinished — no reading yet — for a User who has chosen not
  // to count calories. The same absent Budget, the opposite sentence.
  await mockSummary(page)

  await goto('/', { waitUntil: 'hydration' })

  await expect(
    page.getByText(/log your first weight to get started/i),
  ).toBeVisible()
  await expect(page.getByText(/calorie budget/i)).toHaveCount(0)
  await expect(page.getByRole('link', { name: /finish setup/i })).toHaveCount(0)
})

test('the Today page hides the setup nudge from a weight-only user who has weighed in', async ({
  page,
  goto,
}) => {
  await mockWeightApi(page)
  await mockProfile(page, {
    sex: 'MALE',
    birthDate: '1990-06-15',
    heightCm: 180,
    tracksCalories: false,
  })
  // Finished setup and no Budget by choice: there is nothing left to nag about.
  await mockSummary(page, {
    date: '2026-05-22',
    setupComplete: true,
    caloriesConsumed: 0,
    proteinConsumed: 0,
    estimatedCalorieShare: 0,
    calorieBudget: null,
    proteinFloor: null,
    caloriesRemaining: null,
    dayStatus: null,
    trendWeightKg: 86,
    entries: [],
  })

  await goto('/', { waitUntil: 'hydration' })

  await expect(page.getByText(/get started/i)).toHaveCount(0)
  await expect(page.getByText(/finish setup/i)).toHaveCount(0)
})
