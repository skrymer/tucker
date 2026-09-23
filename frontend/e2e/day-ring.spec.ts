import type { Locator } from '@playwright/test'
import { expect, test } from './support/test'
import {
  mockGoalProgress,
  mockNoActiveGoal,
  mockSummary,
  mockWeightApi,
} from './support/mock-api'
import { goalProgress } from '../test/goal-fixtures'
import { drawnHoleDiameter, inkWidth, rings } from './support/ring'

// The Day Ring's centre and legend, measured. jsdom has no layout, so a
// component test can pin the *constraint* but never the rendered result.

/** A fresh day on a four-digit Budget — `1702 kcal left`, every morning. */
const FRESH_DAY = {
  date: '2026-05-22',
  caloriesConsumed: 0,
  proteinConsumed: 0,
  estimatedCalorieShare: 0,
  setupComplete: true,
  calorieBudget: 1702,
  proteinFloor: 140,
  caloriesRemaining: 1702,
  dayStatus: 'on-target',
  entries: [],
}

/** The same Budget, well past it — `5446 kcal over`, the red four-digit state. */
const WELL_OVER = {
  ...FRESH_DAY,
  caloriesConsumed: 7148,
  proteinConsumed: 205,
  caloriesRemaining: -5446,
  dayStatus: 'over-budget',
}

for (const [state, summary, figure] of [
  ['a fresh day', FRESH_DAY, '1702'],
  ['a day well over budget', WELL_OVER, '5446'],
] as const) {
  test(`the centre figure stays inside the donut hole on ${state}`, async ({
    page,
    goto,
  }) => {
    await mockWeightApi(page)
    await mockNoActiveGoal(page)
    await mockSummary(page, summary)

    await goto('/', { waitUntil: 'hydration' })

    const centre = page.getByText(figure, { exact: true })
    await expect(centre).toBeVisible()

    const [ink, hole] = await Promise.all([
      inkWidth(centre),
      drawnHoleDiameter(rings(page).first()),
    ])
    expect(ink).toBeLessThanOrEqual(hole)
  })
}

test('the centre figure stays inside the hole when the User enlarges their text', async ({
  page,
  goto,
}) => {
  // The figure is sized in rem and the ring has to follow it, or the margin that
  // makes four digits fit is spent by a browser setting the User owns. Setting
  // the root font size is what Chrome's text-size preference does to rem.
  await page.addInitScript(() => {
    const enlarge = () => {
      document.documentElement.style.fontSize = '20px'
    }
    // An init script runs before the document exists on the first navigation.
    if (document.documentElement) enlarge()
    else document.addEventListener('DOMContentLoaded', enlarge)
  })
  await mockWeightApi(page)
  await mockNoActiveGoal(page)
  await mockSummary(page, FRESH_DAY)

  await goto('/', { waitUntil: 'hydration' })

  const centre = page.getByText('1702', { exact: true })
  await expect(centre).toBeVisible()

  const [ink, hole] = await Promise.all([
    inkWidth(centre),
    drawnHoleDiameter(rings(page).first()),
  ])
  expect(ink).toBeLessThanOrEqual(hole)
})

test("the goal ring's centre figure stays inside its own, wider hole", async ({
  page,
  goto,
}) => {
  // The two rings draw at one size but not one hole — the Goal ring sweeps a
  // single arc, at the outer radius — so the rule is checked on each of them, at
  // the longest figure this one can state: a hundred-kilo cut, five characters.
  await mockWeightApi(page)
  await mockSummary(page, FRESH_DAY)
  await mockGoalProgress(
    page,
    goalProgress({ startWeightKg: 180, targetWeightKg: 80, kgToGo: 100 }),
  )

  await goto('/', { waitUntil: 'hydration' })

  const centre = page.getByText('100.0', { exact: true })
  await expect(centre).toBeVisible()

  const [ink, hole] = await Promise.all([
    inkWidth(centre),
    drawnHoleDiameter(rings(page).nth(1)),
  ])
  expect(ink).toBeLessThanOrEqual(hole)
})

/**
 * A row's title and its meter share a line when their vertical extents overlap —
 * two stacked lines cannot, whatever the gap between them.
 */
async function sharesALine(title: Locator, bar: Locator) {
  const [titleBox, barBox] = await Promise.all([
    title.boundingBox(),
    bar.boundingBox(),
  ])
  if (!titleBox || !barBox) throw new Error('a legend row did not render')
  return (
    titleBox.y < barBox.y + barBox.height &&
    barBox.y < titleBox.y + titleBox.height
  )
}

test('each legend row puts its title and its bar on one line', async ({
  page,
  goto,
}) => {
  await mockWeightApi(page)
  await mockNoActiveGoal(page)
  await mockSummary(page, FRESH_DAY)

  await goto('/', { waitUntil: 'hydration' })

  await expect(page.getByRole('progressbar')).toHaveCount(2)

  const [calories, protein] = await Promise.all([
    sharesALine(
      page.getByText('Calories', { exact: true }),
      page.getByRole('progressbar', {
        name: 'Calories against the Calorie Budget',
      }),
    ),
    sharesALine(
      page.getByText('Protein', { exact: true }),
      page.getByRole('progressbar', {
        name: 'Protein against the Protein Floor',
      }),
    ),
  ])
  expect(calories).toBe(true)
  expect(protein).toBe(true)
})
