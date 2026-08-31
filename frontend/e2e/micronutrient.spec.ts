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
  micronutrientRow,
  referenceFoodCandidate,
  unmatchedFood,
  unstatedMicronutrientRow,
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
    loggedDays: 7,
    rows: [],
    coverage: 0.62,
    unmatched: [
      { foodId: 1, name: 'Chicken breast', share: 0.27 },
      { foodId: 2, name: 'Jasmine rice', share: 0.11 },
    ],
  })

  await goto('/review', { waitUntil: 'hydration' })

  await expect(
    page.getByText(
      "62% of the last 7 days' calories came from food Tucker can read vitamins and minerals for.",
    ),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: '2 foods are not matched yet' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Match Chicken breast' }),
  ).toBeHidden()
})

test('reads the week per nutrient, tiling what it can claim and only naming what it cannot', async ({
  page,
  goto,
}) => {
  await mockNoActiveGoal(page)
  await mockIntakeBreakdown(page)
  await mockReviewHistory(page, [])
  await mockMicronutrientIntake(page, {
    totalCalories: 12000,
    loggedDays: 5,
    coverage: 0.62,
    rows: [
      micronutrientRow({
        nutrient: 'SODIUM',
        label: 'Sodium',
        unit: 'mg',
        amount: 2430,
        recommended: null,
        limit: { amount: 2000, kind: 'SUGGESTED_DIETARY_TARGET' },
        claim: 'OVER_LIMIT',
      }),
      micronutrientRow({
        nutrient: 'IRON',
        label: 'Iron',
        unit: 'mg',
        amount: 21.4,
        recommended: 18,
        limit: { amount: 45, kind: 'UPPER_LEVEL' },
        claim: 'CLEARS_REFERENCE',
      }),
      unstatedMicronutrientRow({
        nutrient: 'VITAMIN_B12',
        label: 'Vitamin B12',
        unit: 'µg',
      }),
    ],
    unmatched: [{ foodId: 1, name: 'Chicken breast', share: 0.27 }],
  })

  await goto('/review', { waitUntil: 'hydration' })

  const section = page.getByRole('region', { name: 'Vitamins and minerals' })
  // The seven-day claim is discounted by the log behind it (ADR 0026).
  await expect(section.getByText('5 of 7 days logged')).toBeVisible()
  await expect(section.getByRole('group', { name: 'Sodium' })).toContainText(
    'Suggested target 2000 mg',
  )
  await expect(section.getByRole('group', { name: 'Iron' })).toContainText(
    '≥ 21 mg',
  )
  // A shortfall is not published, so it is not drawn: the name is there and the
  // 0.30 µg behind it is nowhere on the page (ADR 0027).
  await expect(section.getByText(/Not enough matched to say/)).toContainText(
    'Vitamin B12',
  )
  await expect(section.getByRole('group', { name: 'Vitamin B12' })).toBeHidden()
  await expect(section.getByText('0.30 µg')).toBeHidden()
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

test('with Calorie Tracking off the catalog says nothing about a borrow', async ({
  page,
  goto,
}) => {
  await mockProfile(page, {
    sex: 'MALE',
    birthDate: '1990-06-15',
    heightCm: 180,
    tracksCalories: false,
  })
  await page.route('**/api/foods', (route) =>
    route.fulfill({
      json: [
        food({
          id: 1,
          name: 'Chicken breast',
          referenceFoodId: chickenBreast.id,
          referenceFoodName: chickenBreast.name,
        }),
      ],
    }),
  )

  await goto('/foods', { waitUntil: 'hydration' })

  // The row is up, so the page has settled and a subline would have rendered.
  await expect(
    page.getByRole('button', { name: 'Log Chicken breast' }),
  ).toBeVisible()
  // Gated on the setting rather than on the row still holding a match: this
  // User matched foods before turning tracking off, and the whole surface goes
  // with the setting (ADR 0027).
  await expect(page.getByText(/Vitamins and minerals from/)).toBeHidden()
  await expect(
    page.getByRole('button', { name: /borrows vitamins and minerals from/ }),
  ).toBeHidden()
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
            rows: [
              micronutrientRow({ label: 'Iron', claim: 'CLEARS_REFERENCE' }),
            ],
            unmatched: [],
          })
        : micronutrientIntake({
            totalCalories: 12000,
            coverage: 0,
            rows: [],
            unmatched: [
              unmatchedFood({ foodId: 1, name: 'Chicken breast', share: 1 }),
            ],
          }),
    }),
  )
  await page.route('**/api/foods/*/reference-food', (route) => {
    matched = true
    return route.fulfill({ json: { id: 1, referenceFoodId: 101 } })
  })

  await goto('/review', { waitUntil: 'hydration' })

  await page.getByRole('button', { name: '1 food is not matched yet' }).click()
  await page.getByRole('button', { name: 'Match Chicken breast' }).click()

  // On Mobile Chrome this sheet is a Reka Dialog bottom sheet (ADR 0017), a
  // different form factor with its own max height — and the licence paragraph
  // shares its scroll container with the candidates. Both have to be reachable:
  // the attribution is an obligation, and a candidate you cannot get to is a
  // picker that does not work.
  const sheet = page.getByRole('dialog')
  await expect(
    sheet.getByText(/Based on the Australian Food Composition Database/),
  ).toBeVisible()

  await sheet
    .getByRole('button', { name: /Chicken, breast, lean flesh, raw/ })
    .click()

  await expect(
    page.getByText(
      "100% of the last 7 days' calories came from food Tucker can read vitamins and minerals for.",
    ),
  ).toBeVisible()
  await expect(page.getByText(/Nothing left to match/)).toBeVisible()
  // Every calorie is covered now, so there is no rest for estimates and recipes
  // to account for — and a card reading 100% must not claim otherwise.
  await expect(
    page.getByText(/The rest came from meals you estimated/),
  ).toBeHidden()
})
