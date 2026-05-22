import { expect, test } from '@nuxt/test-utils/playwright'
import { mockSummary } from './support/mock-api'

test('the Today page shows the daily summary from the API', async ({
  page,
  goto,
}) => {
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
      - paragraph: 1500 / 2000 kcal
      - paragraph: 120 / 140 g protein
      - paragraph: Off target
      - list:
        - listitem: "Oats — 240 kcal"
  `)
})
