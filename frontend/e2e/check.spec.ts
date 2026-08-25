import { expect, test } from './support/test'
import { mockSummary } from './support/mock-api'
import { denyCamera, fakeBarcodeCamera } from './support/fake-camera'

// F11 slice 1: the Check tab. A scan states what a product costs and returns
// against the whole day's targets, and creates nothing.

const BARCODE = '3017620422003'

const withBudget = {
  date: '2026-05-22',
  caloriesConsumed: 0,
  proteinConsumed: 0,
  estimatedCalorieShare: 0,
  setupComplete: true,
  calorieBudget: 2492,
  proteinFloor: 170,
  caloriesRemaining: 2492,
  dayStatus: null,
  entries: [],
}

/** Nutella against a 2492 kcal Budget and a 170 g Floor — well below pace. */
const nutellaCheck = {
  name: 'Nutella',
  barcode: BARCODE,
  source: 'Open Food Facts',
  caloriesPer100g: 533.3,
  proteinPer100g: 6.3,
  carbsPer100g: 57.5,
  fatPer100g: 30.9,
  calorieBudgetKcal: 2492,
  proteinFloorG: 170,
  costSharePer100g: 0.214,
  returnSharePer100g: 0.037,
  paceGPer100Kcal: 6.82,
  proteinPer100Kcal: 1.18,
  balanceProteinPer100gG: 30.1,
  gramsInBudget: 467.3,
  wholeDayProteinShortfallG: 140.6,
  proteinEnergyShare: 0.047,
  carbsEnergyShare: 0.431,
  fatEnergyShare: 0.521,
}

test('a scanned product states its cost and return against the day', async ({
  page,
  goto,
}) => {
  await mockSummary(page, withBudget)
  await page.route(`**/api/check/${BARCODE}`, (route) =>
    route.fulfill({ json: nutellaCheck }),
  )
  // The decoder's WASM is served from our own origin, not zxing-wasm's default
  // CDN: blocking that CDN must change nothing. Otherwise this "fast and
  // deterministic" suite would depend on a third party, and a Check in a shop —
  // where there is no manual fallback — would silently never decode.
  await page.route('**jsdelivr.net/**', (route) => route.abort())
  await fakeBarcodeCamera(page, BARCODE)

  await goto('/check', { waitUntil: 'hydration' })

  // The decode runs the real zxing-wasm reader off the fake stream, so give it
  // room; everything after is the resolved Check.
  await expect(page.getByRole('heading', { name: 'Nutella' })).toBeVisible({
    timeout: 20_000,
  })
  await expect(page.getByRole('main')).toMatchAriaSnapshot()
})

test('the Check tab is reachable from the primary navigation', async ({
  page,
  goto,
}) => {
  await mockSummary(page, withBudget)
  await denyCamera(page)

  await goto('/', { waitUntil: 'hydration' })
  await page.getByRole('link', { name: 'Check' }).click()

  await expect(page).toHaveURL(/\/check$/)
  await expect(page.getByRole('heading', { name: 'Check' })).toBeVisible()
})

test('a blocked camera ends the tab rather than offering a manual path', async ({
  page,
  goto,
}) => {
  await mockSummary(page, withBudget)
  await denyCamera(page)

  await goto('/check', { waitUntil: 'hydration' })

  await expect(page.getByText('Camera access is blocked')).toBeVisible()
  // A Check produces nothing, so there is nothing worth typing for. Add-Food
  // keeps both manual paths (ADR 0006) — this narrows only the Check tab.
  await expect(page.getByRole('textbox')).toHaveCount(0)
  await expect(page.getByRole('spinbutton')).toHaveCount(0)
})

test('without a calorie budget the setup prompt replaces the scanner', async ({
  page,
  goto,
}) => {
  await mockSummary(page)
  await fakeBarcodeCamera(page, BARCODE)

  await goto('/check', { waitUntil: 'hydration' })

  await expect(
    page.getByText('Finish setup to see your calorie budget'),
  ).toBeVisible()
  // No invented denominator, and no analysis drawn against one.
  await expect(page.getByText('Costs')).toHaveCount(0)
  await expect(page.getByText('Returns')).toHaveCount(0)
})
