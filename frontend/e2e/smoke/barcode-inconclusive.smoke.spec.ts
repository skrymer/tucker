import type { Locator, Page } from '@playwright/test'
import { test, expect } from './support/smoke-test'
import { INDUCED_503_NOISE, UNREACHABLE_BARCODE } from './support/off-stub'

// Issue #164 smoke: an **Inconclusive Lookup** is distinguishable from a genuine
// miss, through the whole real chain.
//
// The stub refuses one reserved barcode with a 503, so this crosses every layer
// that used to swallow the signal. Doing it in the real stack is the point — the
// signal died *between* the provider and the controller, so a test that stubs the
// provider bean proves nothing about the fix. See fixtures/off-stub/README.md.

const API = 'http://localhost:8080/api'

/** No recorded fixture, so the stub 404s exactly as OFF answers a miss. */
const MISSING_BARCODE = '9990000000164'

/**
 * Open the Add-food sheet on a loaded `/foods` and run one look-up, leaving each
 * test showing only what differs — the barcode it asked about, and what it
 * expects back.
 */
async function lookUpBarcode(page: Page, barcode: string): Promise<Locator> {
  await page.getByRole('button', { name: 'Add food' }).click()
  const sheet = page.getByRole('dialog', { name: /add food/i })
  await expect(sheet).toBeVisible()

  await sheet.getByLabel(/barcode/i).fill(barcode)
  await sheet.getByRole('button', { name: /look up/i }).click()
  return sheet
}

test('an unreachable source and a genuine miss are different answers at the API', async ({
  request,
}) => {
  const [unreachable, missing] = await Promise.all([
    request.get(`${API}/foods/barcode/${UNREACHABLE_BARCODE}`),
    request.get(`${API}/foods/barcode/${MISSING_BARCODE}`),
  ])

  // 503 says "nobody could be asked"; 404 says "everybody was, and none knew it".
  // Collapsing these is what let a passing failure look like a permanent verdict.
  expect(unreachable.status()).toBe(503)
  expect(missing.status()).toBe(404)
})

test.describe('a source that could not answer', () => {
  // Scoped to the one test that induces the 503, not the file: the miss test
  // below must stay strict about it, because a 503 arriving on a path that
  // should have missed is the exact bug #164 fixed.
  test.use({ allowedErrors: INDUCED_503_NOISE })

  test('a lookup no source could answer says so instead of a bare blank form', async ({
    page,
    goto,
  }) => {
    await goto('/foods', { waitUntil: 'hydration' })
    const sheet = await lookUpBarcode(page, UNREACHABLE_BARCODE)

    await expect(sheet.getByText("Couldn't look that up")).toBeVisible()
    await expect(sheet.getByText(/didn't get through/i)).toBeVisible()

    // Nothing is gated behind the note: manual entry is an always-on peer here
    // (ADR 0006), so the user can still add the Food without waiting for a retry.
    await expect(sheet.getByLabel(/^name$/i)).toBeEditable()
    await expect(
      sheet.getByRole('button', { name: /save food/i }),
    ).toBeEnabled()
  })

  test('a lookup no source could answer is asked once, not silently twice', async ({
    page,
    goto,
  }) => {
    // Counted at the browser's own boundary, because that is where the doubling
    // lived: ofetch's stock GET retry re-drove the whole Provider chain a second
    // time, unseen (ADR 0007). Deliberately measuring the HTTP client — here it
    // is the thing under test.
    const lookups: string[] = []
    const statuses: number[] = []
    page.on('request', (req) => {
      if (req.url().includes('/api/foods/barcode/')) lookups.push(req.url())
    })
    page.on('response', (res) => {
      if (res.url().includes('/api/foods/barcode/')) statuses.push(res.status())
    })

    await goto('/foods', { waitUntil: 'hydration' })
    const sheet = await lookUpBarcode(page, UNREACHABLE_BARCODE)

    // Safe as a settling point because the retry re-issues on the *same* signal
    // and against an instant 503, so it lands long before anything renders — not
    // because the wrapper awaits it. `useAsyncAction` races the call against its
    // own abort, so on the timeout path the note can appear while ofetch is
    // still mid-retry.
    await expect(sheet.getByText("Couldn't look that up")).toBeVisible()

    expect(lookups).toHaveLength(1)

    // That the one ask was *answered* 503 is what keeps the count meaningful.
    // This note renders for a client-side 8 s abort too, and an abort suppresses
    // ofetch's retry all by itself — so a run that drifted onto the timeout path
    // would show one request with the retry still enabled, and the assertion
    // above would pass while guarding nothing.
    expect(statuses).toEqual([503])
  })
})

test('a genuine miss drops to manual entry without claiming the lookup failed', async ({
  page,
  goto,
}) => {
  await goto('/foods', { waitUntil: 'hydration' })
  const sheet = await lookUpBarcode(page, MISSING_BARCODE)

  // The blank form is the honest answer here, so it arrives unaccompanied — the
  // two failures must never be interchangeable.
  await expect(sheet.getByLabel(/^name$/i)).toHaveValue('')
  await expect(sheet.getByText("Couldn't look that up")).toBeHidden()
})
