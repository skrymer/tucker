import type { APIResponse } from '@playwright/test'
import { test, expect } from './support/smoke-test'
import { todayIso } from '../support/date'
import {
  ACCESS_ASSERTION_HEADER,
  mintAccessToken,
} from '../../scripts/access-token.mjs'

const API = 'http://localhost:8080/api'

// F10 slice 3 smoke: a User's catalog and day are theirs alone, proved through
// the whole real stack — the browser's own requests going out through the Nuxt
// /api proxy, and the backend verifying a genuine signed assertion on each one
// (ADR 0020, ADR 0021).
//
// Two identities, arriving the two ways Tucker actually has. The browser is the
// signed-in User: the proxy attaches the token global setup minted, exactly as it
// does in `pnpm dev`. The *other* User is a second request context carrying an
// assertion minted for a different email — which is all switching identity takes,
// because the suite mints per test rather than per run (see support/smoke-test.ts).
//
// Both Users are given data, so the assertion is "sees exactly their own" rather
// than the much weaker "sees nothing". No cleanup: the auto `freshDatabase`
// fixture empties the database before every test.
test('a User sees only their own catalog and their own day', async ({
  page,
  goto,
  playwright,
  request,
}) => {
  const other = await playwright.request.newContext({
    extraHTTPHeaders: {
      [ACCESS_ASSERTION_HEADER]: await mintAccessToken({
        email: 'someone.else@tucker.invalid',
      }),
    },
  })

  try {
    const today = todayIso()

    // The other User's catalog and day.
    await expectCreated(
      other.post(`${API}/foods`, {
        data: {
          name: 'Their almonds',
          proteinPer100g: 21,
          carbsPer100g: 22,
          fatPer100g: 50,
        },
      }),
    )
    await expectCreated(
      other.post(`${API}/entries/estimated`, {
        data: {
          date: today,
          label: 'Their lunch out',
          calories: 700,
          protein: 40,
        },
      }),
    )

    // The signed-in User's own, deliberately smaller so a leaked total is
    // unmistakable rather than plausible.
    await expectCreated(
      request.post(`${API}/foods`, {
        data: {
          name: 'My skyr',
          proteinPer100g: 10,
          carbsPer100g: 4,
          fatPer100g: 1,
        },
      }),
    )
    await expectCreated(
      request.post(`${API}/entries/estimated`, {
        data: {
          date: today,
          label: 'My porridge',
          calories: 250,
          protein: 12,
        },
      }),
    )

    await goto('/foods', { waitUntil: 'hydration' })
    await expect(page.getByText('My skyr')).toBeVisible()
    await expect(page.getByText('Their almonds')).toHaveCount(0)

    await goto('/', { waitUntil: 'hydration' })
    await expect(
      page.getByRole('main').getByText('My porridge — 250 kcal'),
    ).toBeVisible()
    await expect(page.getByText('Their lunch out')).toHaveCount(0)

    // The totals matter as much as the rows: a leak here shows no other name,
    // only a number that is quietly wrong. 950 kcal would mean both days summed.
    await expect(page.getByText('250 kcal, 12 g protein')).toBeVisible()
  } finally {
    await other.dispose()
  }
})

/** Assert a seeding call was accepted, failing with the body when it was not. */
async function expectCreated(pending: Promise<APIResponse>) {
  const response = await pending
  expect(response.status(), await response.text()).toBe(201)
}
