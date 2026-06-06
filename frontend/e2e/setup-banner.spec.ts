import { expect, test } from './support/test'
import { mockSummary, mockWeightApi } from './support/mock-api'

test('the Today page nudges the user to finish setup when there is no budget', async ({
  page,
  goto,
}) => {
  await mockWeightApi(page)
  // The default mocked summary is the pre-first-review state: calorieBudget null.
  await mockSummary(page)

  await goto('/', { waitUntil: 'hydration' })

  await expect(
    page.getByText(/finish setup to see your calorie budget/i),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: /finish setup/i }),
  ).toHaveAttribute('href', '/profile')
})

test('the Today page hides the setup nudge once a budget exists', async ({
  page,
  goto,
}) => {
  await mockWeightApi(page)
  await mockSummary(page, {
    date: '2026-05-22',
    caloriesConsumed: 0,
    proteinConsumed: 0,
    estimatedCalorieShare: 0,
    calorieBudget: 2000,
    proteinFloor: 140,
    caloriesRemaining: 2000,
    onTarget: true,
    entries: [],
  })

  await goto('/', { waitUntil: 'hydration' })

  await expect(
    page.getByText(/finish setup to see your calorie budget/i),
  ).toHaveCount(0)
})
