import { expect, test } from '@nuxt/test-utils/playwright'
import { mockSummary, mockWeightApi } from './support/mock-api'

test('the Today page shows the daily summary from the API', async ({
  page,
  goto,
}) => {
  await mockWeightApi(page)
  await mockSummary(page, {
    date: '2026-05-22',
    caloriesConsumed: 1500,
    proteinConsumed: 120,
    estimatedCalorieShare: 0,
    calorieBudget: 2000,
    proteinFloor: 140,
    caloriesRemaining: 500,
    onTarget: false,
    entries: [
      {
        id: 1,
        loggedOn: '2026-05-22',
        kind: 'WEIGHED',
        calories: 240,
        isEstimate: false,
        foodId: 3,
        foodName: 'Oats',
        grams: 60,
      },
    ],
  })

  await goto('/', { waitUntil: 'hydration' })

  await expect(page.getByRole('main')).toMatchAriaSnapshot(`
    - main:
      - heading "Today" [level=1]
      - heading "Today's weight" [level=2]
      - paragraph: No weight logged today.
      - button "Log weight"
      - heading "Calories" [level=2]
      - paragraph: 1500 / 2000 kcal
      - heading "Protein" [level=2]
      - paragraph: 120 / 140 g protein
      - paragraph: Off target
      - heading "Today's entries" [level=2]
      - list:
        - listitem: "Oats — 240 kcal"
      - button "Log entry"
  `)
})

test("logging a weight from the tile shows it as today's weight", async ({
  page,
  goto,
}) => {
  await mockWeightApi(page)
  await mockSummary(page)

  await goto('/', { waitUntil: 'hydration' })

  await page.getByRole('button', { name: 'Log weight' }).click()
  await page.getByLabel(/weight \(kg\)/i).fill('84.2')
  await page
    .getByRole('dialog', { name: /log weight/i })
    .getByRole('button', { name: /save weight/i })
    .click()

  // The tile flips into logged-today state with the value and an edit affordance.
  await expect(page.getByText('84.2 kg')).toBeVisible()
  await expect(
    page.getByRole('button', { name: /edit today's weight/i }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Log weight' })).toHaveCount(0)
})
