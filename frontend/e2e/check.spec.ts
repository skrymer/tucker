import { expect, test } from './support/network'
import { denyCamera, fakeBarcodeCamera } from './support/fake-camera'
import { withOverflowNav } from './support/nav'
import { pinToLocalMorning } from './support/date'
import { nutellaCheck } from '../test/check-fixtures'
import { checkOnlyOn } from '../test/mocks/handlers/check'
import { setupUnfinished, summaryWith } from '../test/mocks/handlers/summary'

// F11 slice 1: Check. A scan states what a product costs and returns against
// the whole day's targets, and creates nothing. It is reached from `More`. The
// baseline User has a Calorie Budget, and the Nutrition Provider knows Nutella.

const BARCODE = nutellaCheck.barcode

test('a scanned product states its cost and return against the day', async ({
  page,
  goto,
}) => {
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

test("a Check asks about the User's local day, not the server's", async ({
  page,
  goto,
  network,
}) => {
  // Sending the UTC date instead of the local one picks a different review.
  // Only the User's own day has targets standing on it; asked about any other,
  // the lookup refuses, and the page says it couldn't look the product up.
  network.use(checkOnlyOn(await pinToLocalMorning(page)))
  await page.route('**jsdelivr.net/**', (route) => route.abort())
  await fakeBarcodeCamera(page, BARCODE)

  await goto('/check', { waitUntil: 'hydration' })

  await expect(page.getByRole('heading', { name: 'Nutella' })).toBeVisible({
    timeout: 20_000,
  })
})

test('Check is reachable from the navigation, under More', async ({
  page,
  goto,
}) => {
  await denyCamera(page)

  await goto('/', { waitUntil: 'hydration' })
  await withOverflowNav(page, (nav) =>
    nav.getByRole('link', { name: 'Check' }).click(),
  )

  await expect(page).toHaveURL(/\/check$/)
  await expect(page.getByRole('heading', { name: 'Check' })).toBeVisible()
})

test('a blocked camera ends the tab rather than offering a manual path', async ({
  page,
  goto,
}) => {
  await denyCamera(page)

  await goto('/check', { waitUntil: 'hydration' })

  await expect(page.getByText('Camera access is blocked')).toBeVisible()
  // A Check produces nothing, so there is nothing worth typing for. Add-Food
  // keeps both manual paths (ADR 0006) — this narrows only Check.
  await expect(page.getByRole('textbox')).toHaveCount(0)
  await expect(page.getByRole('spinbutton')).toHaveCount(0)
})

test('without a calorie budget the setup prompt replaces the scanner', async ({
  page,
  goto,
  network,
}) => {
  network.use(summaryWith(setupUnfinished))
  await fakeBarcodeCamera(page, BARCODE)

  await goto('/check', { waitUntil: 'hydration' })

  await expect(
    page.getByText('Finish setup to see your calorie budget'),
  ).toBeVisible()
  // No invented denominator, and no analysis drawn against one.
  await expect(page.getByText('Costs')).toHaveCount(0)
  await expect(page.getByText('Returns')).toHaveCount(0)
})
