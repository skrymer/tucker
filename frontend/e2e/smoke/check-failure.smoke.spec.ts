import type { APIRequestContext } from '@playwright/test'
import { test, expect } from './support/smoke-test'
import { todayIso } from '../support/date'
import { cameraStarts, fakeBarcodeCamera } from '../support/fake-camera'
import { INDUCED_503_NOISE, UNREACHABLE_BARCODE } from './support/off-stub'

// F11 Check slice 3: the two ways a Check can fail need opposite advice, and a
// Check has no manual fallback — so the message *is* the entire failure
// experience. This drives both through the real chain, because the signal that
// tells them apart is a status code that used to die between the provider and
// the controller (#164); a test that stubs the provider proves nothing about it.
//
// Only the camera hardware is faked. The app's real zxing-wasm decoder reads
// the barcode, and the backend decides which failure it is.
const API = 'http://localhost:8080/api'

/** No recorded fixture, so the stub 404s exactly as OFF answers a miss. */
const MISSING_BARCODE = '9990000000171'

/**
 * A Check is a share of the Calorie Budget and the Protein Floor, so the tab is
 * gated behind having one — and a Weekly Review is what produces them. No Food
 * is seeded: every barcode here must fall past an empty catalog to the provider,
 * which is the only place these two failures can be told apart.
 */
async function seedTargets(request: APIRequestContext) {
  const today = todayIso()

  await request.put(`${API}/profile`, {
    data: { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 },
  })
  await request.post(`${API}/weight`, { data: { date: today, weightKg: 85 } })
  const goal = await request.post(`${API}/goal`, {
    data: { startedOn: today, targetWeightKg: 80, rateKgPerWeek: 0.5 },
  })
  expect(goal.status()).toBe(201)

  const summary = await (
    await request.get(`${API}/summary`, { params: { date: today } })
  ).json()
  expect(summary.calorieBudget).toBeGreaterThan(0)
}

test.describe('a source that could not answer', () => {
  // Scoped to this block, not the file: a 503 reaching the *miss* path below is
  // precisely the bug #164 fixed, so that test stays strict about it.
  test.use({ allowedErrors: INDUCED_503_NOISE })

  test('offers a retry that asks again without sending the user back to the package', async ({
    page,
    goto,
    request,
  }) => {
    await seedTargets(request)

    const lookups: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('/api/check/')) lookups.push(req.url())
    })

    await fakeBarcodeCamera(page, UNREACHABLE_BARCODE)
    await goto('/check', { waitUntil: 'hydration' })

    // The real decoder needs a few frames off the synthetic stream.
    await expect(page.getByText("Couldn't look that up")).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByText(/Try again in a moment/)).toBeVisible()
    // Never a verdict about the package: nobody found out whether it exists.
    await expect(page.getByText('Not in the food database')).toHaveCount(0)

    const asksBeforeRetry = lookups.length
    // Absolute, not just a baseline for the comparison below: the scan asked
    // once, because this look-up passes `retry: 0` (ADR 0007). The relative
    // assertion alone would read 2 then 4 > 2 and stay green if ofetch's stock
    // retry came back, leaving the Check half of that rule unguarded.
    expect(asksBeforeRetry).toBe(1)
    const camerasBeforeRetry = await cameraStarts(page)
    // The scan that got us here acquired the camera, so the counter is live.
    // Without this the comparison below would read 0 === 0 and pass even if the
    // counter had stopped working — vacuously green on the slice's whole point.
    expect(camerasBeforeRetry).toBeGreaterThan(0)
    await page.getByRole('button', { name: 'Try again' }).click()

    // The button re-asks the same question rather than doing nothing…
    await expect
      .poll(() => lookups.length, { timeout: 10_000 })
      .toBeGreaterThan(asksBeforeRetry)

    // …and it re-asks it *without* going back to the camera. This is the whole
    // point of the slice, and it needs the acquisition count to prove: a
    // restarted camera would re-decode the same barcode off the fake stream
    // within seconds and issue its own look-up, so the request count above
    // rises either way, and the alert below reappears either way — a retrying
    // toBeVisible() simply waits out the viewfinder in between.
    expect(await cameraStarts(page)).toBe(camerasBeforeRetry)

    // The stub is still refusing, so the same failure is still the answer.
    await expect(page.getByText("Couldn't look that up")).toBeVisible()
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()

    // The scan produced a question, not a Food — a Check saves nothing, and a
    // failed one least of all.
    const foods = (await (
      await request.get(`${API}/foods`)
    ).json()) as unknown[]
    expect(foods).toHaveLength(0)
  })
})

test('a barcode no source knows says so, and offers nothing to retry', async ({
  page,
  goto,
  request,
}) => {
  await seedTargets(request)

  await fakeBarcodeCamera(page, MISSING_BARCODE)
  await goto('/check', { waitUntil: 'hydration' })

  await expect(page.getByText('Not in the food database')).toBeVisible({
    timeout: 20_000,
  })
  await expect(page.getByText(MISSING_BARCODE, { exact: false })).toBeVisible()

  // Everything that could be asked was asked. Retrying is futile, so the
  // control is absent rather than merely discouraged — and the message must not
  // be the one that invites another go.
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0)
  await expect(page.getByText("Couldn't look that up")).toHaveCount(0)

  // Moving on is still offered: this product is a dead end, the tab isn't.
  await expect(page.getByRole('button', { name: 'Scan another' })).toBeVisible()
})
