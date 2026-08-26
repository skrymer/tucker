import { test, expect } from './support/smoke-test'
import { CSRF_COOKIE, CSRF_HEADER } from '../../app/utils/csrf'
import {
  ACCESS_ASSERTION_HEADER,
  mintAccessToken,
} from '../../scripts/access-token.mjs'
import { todayIso } from '../support/date'

// Real-stack proof of the CSRF defence (ADR 0025). Every other suite covers a
// half of it and none covers the join: `CsrfGateTest` drives the real filter but
// no browser, and the mocked e2e suite stubs `/api/*`, so it would go on passing
// with CSRF disabled, the cookie or header misspelled, or the token's XOR
// round-trip broken. Only here are the browser, the nitro `/api` proxy and
// Spring's `CsrfFilter` all real at once.

test('hands the page a CSRF token cookie the page can read', async ({
  page,
  goto,
}) => {
  await goto('/', { waitUntil: 'hydration' })

  const origin = new URL(page.url()).origin
  const cookie = (await page.context().cookies(origin)).find(
    (c) => c.name === CSRF_COOKIE,
  )

  // Present at all is the hop nothing else covers: the backend sets this
  // header, and h3's `proxyRequest` has to carry it back through the SPA's own
  // origin or the page never sees it.
  expect(cookie, `no ${CSRF_COOKIE} cookie on ${origin}`).toBeDefined()
  expect(cookie!.value).not.toBe('')

  // Readable by page JavaScript, because reading it there is the whole defence.
  expect(cookie!.httpOnly).toBe(false)
  // Nothing off-site ever needs to send it.
  expect(cookie!.sameSite).toBe('Strict')
  expect(cookie!.path).toBe('/')
})

test('sends a mutation with the token the page was handed', async ({
  page,
  goto,
}) => {
  await goto('/', { waitUntil: 'hydration' })

  const origin = new URL(page.url()).origin
  const handedOut = (await page.context().cookies(origin)).find(
    (c) => c.name === CSRF_COOKIE,
  )?.value

  const saving = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().endsWith('/api/weight'),
  )

  await page.getByRole('button', { name: /^log weight$/i }).click()
  const sheet = page.getByRole('dialog', { name: /log weight/i })
  await expect(sheet).toBeVisible()
  await sheet.getByLabel(/weight \(kg\)/i).fill('84.2')
  await sheet.getByRole('button', { name: /save weight/i }).click()

  // The page put the token on the wire, and it is the one Tucker handed it —
  // which is the step a cross-site page cannot take.
  expect((await saving).headers()[CSRF_HEADER.toLowerCase()]).toBe(handedOut)

  // And `CsrfFilter` accepted it. A header that merely left the browser proves
  // nothing if the backend then refused the mutation.
  await expect(sheet).toBeHidden()
  await expect(page.getByText('84.2 kg')).toBeVisible()
})

test('refuses a mutation that holds the cookie but echoes no header', async ({
  page,
  goto,
  request,
  playwright,
}) => {
  // The executable form of ADR 0025's standing rule: the `/api` proxy must never
  // read the cookie and add the header itself. It sees this request's cookie
  // exactly as it sees the page's, so a proxy that "helpfully" forged the header
  // would turn this 403 into a 200 — and would forge it for an attacker too.
  // Nothing else in any suite goes red if that line is ever added.
  await goto('/', { waitUntil: 'hydration' })
  const origin = new URL(page.url()).origin

  const withoutHeader = await playwright.request.newContext({
    extraHTTPHeaders: { [ACCESS_ASSERTION_HEADER]: await mintAccessToken() },
  })
  try {
    // Signed in and holding the cookie, the way any browser on any page would be.
    const handedOut = await withoutHeader.get(`${origin}/api/version`)
    expect(handedOut.ok()).toBe(true)
    const jar = (await withoutHeader.storageState()).cookies
    expect(jar.find((c) => c.name === CSRF_COOKIE)).toBeDefined()

    const refused = await withoutHeader.post(`${origin}/api/weight`, {
      data: { date: todayIso(), weightKg: 84.2 },
    })
    expect(refused.status()).toBe(403)
  } finally {
    await withoutHeader.dispose()
  }

  // Refused, not merely reported as refused.
  const weights = await request.get('http://localhost:8080/api/weight')
  expect(weights.ok()).toBe(true)
  expect(await weights.json()).toEqual([])
})

test.describe('when the page holds no token', () => {
  // The refused save is a 403 by design, which the browser logs as a failed
  // load. Everything else stays strict.
  test.use({ allowedErrors: [/responded with a status of 403/] })

  test('refuses the mutation, and Retry succeeds on the token the refusal returned', async ({
    page,
    goto,
  }) => {
    await goto('/', { waitUntil: 'hydration' })

    await page.getByRole('button', { name: /^log weight$/i }).click()
    const sheet = page.getByRole('dialog', { name: /log weight/i })
    await expect(sheet).toBeVisible()
    await sheet.getByLabel(/weight \(kg\)/i).fill('84.2')

    // Cleared as late as possible: every response carries a fresh cookie, so an
    // intervening GET would quietly hand the page a token back and this would
    // test the happy path under a misleading name.
    await page.context().clearCookies({ name: CSRF_COOKIE })
    const refused = page.waitForRequest(
      (r) => r.method() === 'POST' && r.url().endsWith('/api/weight'),
    )
    await sheet.getByRole('button', { name: /save weight/i }).click()

    // The premise held: this really did go out unproven.
    expect((await refused).headers()[CSRF_HEADER.toLowerCase()]).toBeUndefined()

    // Located through the DOM rather than the accessibility tree, which is not
    // the house style and is forced: the open sheet is a Reka Dialog, and it
    // marks the toast viewport `aria-hidden="true"` while it is up, so
    // `getByRole` — and the shared `toast()` helper built on it — cannot see
    // this toast at all. Worth knowing beyond this test: an assertive,
    // never-dismissing failure toast raised from inside a sheet is announced to
    // nobody using a screen reader.
    const failure = page
      .locator('[role="region"][aria-label*="otification" i] li')
      .filter({ hasText: 'Could not save weight' })
    await expect(failure).toBeVisible()
    // The sheet is the confirmation, so it stays open — nothing was saved.
    await expect(sheet).toBeVisible()

    // ADR 0025's recovery claim: the 403 response renders a fresh cookie of its
    // own, so ADR 0005's Retry has something to send and no auto-retry is needed.
    await expect
      .poll(async () =>
        (await page.context().cookies(new URL(page.url()).origin)).some(
          (c) => c.name === CSRF_COOKIE,
        ),
      )
      .toBe(true)

    await failure.locator('button', { hasText: /retry/i }).click()

    await expect(sheet).toBeHidden()
    await expect(page.getByText('84.2 kg')).toBeVisible()
    await expect(failure).toHaveCount(0)
  })
})
