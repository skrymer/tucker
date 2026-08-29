import { expect, test } from './support/test'
import {
  mockIntakeBreakdown,
  mockMicronutrientIntake,
  mockNoActiveGoal,
  mockProfile,
  mockReferenceFoods,
  mockReviewHistory,
} from './support/mock-api'
import { weeklyReview } from '../test/review-fixtures'
import { food } from '../test/food-fixtures'
import {
  micronutrientIntake,
  referenceFoodCandidate,
  unmatchedFood,
} from '../test/micronutrient-fixtures'

/**
 * The Vitamins and minerals section on `/review` — the coverage figure, the
 * match queue folded inside it, and the picker a queued Food opens (ADR 0027).
 */

const chickenBreast = referenceFoodCandidate()

test('states the week’s coverage and folds what is left to match into one disclosure', async ({
  page,
  goto,
}) => {
  await mockNoActiveGoal(page)
  await mockIntakeBreakdown(page)
  await mockReviewHistory(page, [])
  await mockMicronutrientIntake(page, {
    totalCalories: 12000,
    coverage: 0.62,
    unmatched: [
      { foodId: 1, name: 'Chicken breast', calories: 3200, share: 0.27 },
      { foodId: 2, name: 'Jasmine rice', calories: 1300, share: 0.11 },
    ],
  })

  await goto('/review', { waitUntil: 'hydration' })

  await expect(
    page.getByText(
      "62% of the last 7 days' calories came from food Tucker can read vitamins and minerals for.",
    ),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: '2 foods to match' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Match Chicken breast' }),
  ).toBeHidden()
})

test('with Calorie Tracking off the section is absent and never asked for', async ({
  page,
  goto,
}) => {
  await mockProfile(page, {
    sex: 'MALE',
    birthDate: '1990-06-15',
    heightCm: 180,
    tracksCalories: false,
  })
  await mockNoActiveGoal(page)
  await mockIntakeBreakdown(page)
  // A review in the ledger, so "Run review now" is the settled-page marker below
  // rather than the empty state's own call to action.
  await mockReviewHistory(page, [
    weeklyReview({ id: 1, reviewedOn: '2026-06-01', trendWeightKg: 86 }),
  ])
  const asked: string[] = []
  await page.route('**/api/micronutrient-intake**', (route) => {
    asked.push(route.request().url())
    return route.fulfill({ json: {} })
  })

  await goto('/review', { waitUntil: 'hydration' })

  // The ledger is up, so the page has settled and the fetch would have fired.
  await expect(
    page.getByRole('button', { name: 'Run review now' }),
  ).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Vitamins and minerals' }),
  ).toBeHidden()
  // Gated in setup, not left to the data: it reads a log Tucker has agreed to
  // stop asking for, so it must not be asked for either (ADR 0027).
  expect(asked).toHaveLength(0)
})

test('a matched food in the catalog names its borrow and can take it back', async ({
  page,
  goto,
}) => {
  await mockReferenceFoods(page, [chickenBreast])
  let matched = true
  await page.route('**/api/foods', (route) =>
    route.fulfill({
      json: [
        food({
          id: 1,
          name: 'Chicken breast',
          referenceFoodId: matched ? chickenBreast.id : null,
          referenceFoodName: matched ? chickenBreast.name : null,
        }),
      ],
    }),
  )
  await page.route('**/api/foods/*/reference-food', (route) => {
    matched = route.request().method() !== 'DELETE'
    return route.fulfill({ status: 204, body: '' })
  })

  await goto('/foods', { waitUntil: 'hydration' })

  await expect(
    page.getByText(
      'Vitamins and minerals from Chicken, breast, lean flesh, raw',
    ),
  ).toBeVisible()

  await page
    .getByRole('button', {
      name: 'Change what Chicken breast borrows vitamins and minerals from',
    })
    .click()
  await page.getByRole('button', { name: 'Unmatch' }).click()

  await expect(page.getByText(/Vitamins and minerals from/)).toBeHidden()
})

test('matching a queued food from the picker moves the coverage figure', async ({
  page,
  goto,
}) => {
  await mockNoActiveGoal(page)
  await mockIntakeBreakdown(page)
  await mockReviewHistory(page, [])
  await mockReferenceFoods(page, [chickenBreast])

  let matched = false
  await page.route('**/api/micronutrient-intake**', (route) =>
    route.fulfill({
      json: matched
        ? micronutrientIntake({
            totalCalories: 12000,
            coverage: 1,
            unmatched: [],
          })
        : micronutrientIntake({
            totalCalories: 12000,
            coverage: 0,
            unmatched: [
              unmatchedFood({
                foodId: 1,
                name: 'Chicken breast',
                calories: 12000,
                share: 1,
              }),
            ],
          }),
    }),
  )
  await page.route('**/api/foods/*/reference-food', (route) => {
    matched = true
    return route.fulfill({ json: { id: 1, referenceFoodId: 101 } })
  })

  await goto('/review', { waitUntil: 'hydration' })

  await page.getByRole('button', { name: '1 food to match' }).click()
  await page.getByRole('button', { name: 'Match Chicken breast' }).click()
  await page
    .getByRole('button', { name: /Chicken, breast, lean flesh, raw/ })
    .click()

  await expect(
    page.getByText(
      "100% of the last 7 days' calories came from food Tucker can read vitamins and minerals for.",
    ),
  ).toBeVisible()
  await expect(page.getByText('Nothing left to match.')).toBeVisible()
})
