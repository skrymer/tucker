import { test, expect } from './support/smoke-test'

// Issue #164 smoke: an **Inconclusive Lookup** is distinguishable from a genuine
// miss, through the whole real chain.
//
// The stub refuses one reserved barcode with a 503, so this crosses every layer
// that used to swallow the signal. Doing it in the real stack is the point — the
// signal died *between* the provider and the controller, so a test that stubs the
// provider bean proves nothing about the fix. See fixtures/off-stub/README.md.

// This file deliberately induces a 503, which the browser logs as a failed
// resource load. Every other status stays strict.
test.use({ allowedErrors: [/Failed to load resource: .*status of 503/] })

const API = 'http://localhost:8080/api'

/** Refused by the stub; never a real product. See the fixtures README. */
const UNREACHABLE_BARCODE = '5030000000503'

/** No recorded fixture, so the stub 404s exactly as OFF answers a miss. */
const MISSING_BARCODE = '9990000000164'

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

test('a lookup no source could answer says so instead of a bare blank form', async ({
  page,
  goto,
}) => {
  await goto('/foods', { waitUntil: 'hydration' })

  await page.getByRole('button', { name: 'Add food' }).click()
  const sheet = page.getByRole('dialog', { name: /add food/i })
  await expect(sheet).toBeVisible()

  await sheet.getByLabel(/barcode/i).fill(UNREACHABLE_BARCODE)
  await sheet.getByRole('button', { name: /look up/i }).click()

  await expect(sheet.getByText("Couldn't look that up")).toBeVisible()
  await expect(sheet.getByText(/didn't get through/i)).toBeVisible()

  // Nothing is gated behind the note: manual entry is an always-on peer here
  // (ADR 0006), so the user can still add the Food without waiting for a retry.
  await expect(sheet.getByLabel(/^name$/i)).toBeEditable()
  await expect(sheet.getByRole('button', { name: /save food/i })).toBeEnabled()
})

test('a genuine miss drops to manual entry without claiming the lookup failed', async ({
  page,
  goto,
}) => {
  await goto('/foods', { waitUntil: 'hydration' })

  await page.getByRole('button', { name: 'Add food' }).click()
  const sheet = page.getByRole('dialog', { name: /add food/i })
  await expect(sheet).toBeVisible()

  await sheet.getByLabel(/barcode/i).fill(MISSING_BARCODE)
  await sheet.getByRole('button', { name: /look up/i }).click()

  // The blank form is the honest answer here, so it arrives unaccompanied — the
  // two failures must never be interchangeable.
  await expect(sheet.getByLabel(/^name$/i)).toHaveValue('')
  await expect(sheet.getByText("Couldn't look that up")).toBeHidden()
})
