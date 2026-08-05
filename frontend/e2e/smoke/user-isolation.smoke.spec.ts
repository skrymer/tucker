import type { APIRequestContext, APIResponse } from '@playwright/test'
import { test, expect } from './support/smoke-test'
import { todayIso, isoShiftDays } from '../support/date'

const API = 'http://localhost:8080/api'

/** The window the adaptive Maintenance correction looks back over. */
const ADAPTIVE_WINDOW_DAYS = 14

/** Comfortably past the logging-coverage floor that correction demands. */
const DAYS_THEY_LOGGED = 12

// F10 slice 3 smoke: a User's catalog and day are theirs alone, proved through
// the whole real stack — the browser's own requests going out through the Nuxt
// /api proxy, and the backend verifying a genuine signed assertion on each one
// (ADR 0020, ADR 0021).
//
// Two identities, arriving the two ways Tucker actually has. The browser is the
// signed-in User: the proxy attaches the token global setup minted, exactly as it
// does in `pnpm dev`. The *other* User is the `otherUser` fixture — the same kind
// of context carrying an assertion minted for a different email, which is all
// switching identity takes (see support/smoke-test.ts).
//
// Both Users are given data, so the assertion is "sees exactly their own" rather
// than the much weaker "sees nothing". No cleanup: the auto `freshDatabase`
// fixture empties the database before every test.
test('a User sees only their own catalog and their own day', async ({
  page,
  goto,
  otherUser,
  request,
}) => {
  const today = todayIso()

  // The other User's catalog and day.
  await expectCreated(
    otherUser.post(`${API}/foods`, {
      data: {
        name: 'Their almonds',
        proteinPer100g: 21,
        carbsPer100g: 22,
        fatPer100g: 50,
      },
    }),
  )
  await expectCreated(
    otherUser.post(`${API}/entries/estimated`, {
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
})

// F10 slice 4 smoke: the Calorie Budget is derived, not stored, and it is derived
// from *someone's* weight trend and *someone's* intake. A leak there shows no other
// person's name anywhere — only a number that is quietly wrong for both of them
// (issue #158, ADR 0021). This drives that through the whole real stack.
test("another User's logging cannot move this User's Calorie Budget", async ({
  page,
  goto,
  otherUser,
  request,
}) => {
  const today = todayIso()

  // The other User eats 4000 kcal a day and logs nearly every day of the
  // window — exactly the shape the adaptive correction is built to read.
  await completeSetupAcrossTheWindow(otherUser, today, 110)
  for (let back = 1; back <= DAYS_THEY_LOGGED; back++) {
    await expectCreated(
      otherUser.post(`${API}/entries/estimated`, {
        data: {
          date: isoShiftDays(today, -back),
          label: `Their day ${back}`,
          calories: 4000,
          protein: 150,
        },
      }),
    )
  }

  // Their own review adapts to it. This is the positive control: without it the
  // assertion below would pass just as well against a fixture in which nothing
  // could have leaked because nothing was adaptive in the first place.
  const theirs = await (await otherUser.post(`${API}/weekly-review`)).json()
  expect(theirs.maintenanceBasis).toBe('ADAPTIVE')

  // The signed-in User has stepped on the scale across the same window and
  // logged nothing at all.
  await completeSetupAcrossTheWindow(request, today, 85)

  // Opening Tucker runs the review that is due (ADR 0010).
  await goto('/', { waitUntil: 'hydration' })
  await expect(page.getByText(/\/ \d+ kcal/)).toBeVisible()

  const mine = await (await request.get(`${API}/weekly-review`)).json()
  // Seeded from the formula, because *they* have logged nothing. Adapting here
  // would set their Calorie Budget from somebody else's eating.
  expect(mine.maintenanceBasis).toBe('FORMULA_SEED')
  // Stated against the fixture rather than a magic number: a leaked Maintenance
  // would land on the other User's 4000 kcal days, not a kilogram away from it.
  expect(mine.maintenanceKcal).toBeLessThan(theirs.maintenanceKcal - 1000)
  // Exactly their own weight, because two identical readings smooth to
  // themselves. A trend averaged over both people would sit between 85 and 110,
  // dragging the Protein Floor with it.
  expect(mine.trendWeightKg).toBe(85)

  // And the dashboard states that Budget — the one figure the whole app is a
  // presentation of.
  await expect(
    page.getByText(`/ ${Math.round(mine.calorieBudgetKcal)} kcal`),
  ).toBeVisible()
})

/**
 * Set [api]'s User up the way the adaptive correction needs before it will run at
 * all: a Profile to seed Maintenance from, and readings at *both* ends of the
 * window, so there is a trend anchor old enough to measure this week's change
 * against.
 *
 * [today] is passed in rather than read here, so that every date in one test comes
 * from a single clock reading — two `todayIso()` calls either side of midnight
 * would seed a window that does not line up with the one the test asserts on.
 */
async function completeSetupAcrossTheWindow(
  api: APIRequestContext,
  today: string,
  weightKg: number,
) {
  await expectStatus(
    api.put(`${API}/profile`, {
      data: { sex: 'MALE', birthDate: '1986-05-22', heightCm: 180 },
    }),
    200,
  )

  for (const date of [isoShiftDays(today, -ADAPTIVE_WINDOW_DAYS), today]) {
    await expectStatus(
      api.post(`${API}/weight`, { data: { date, weightKg } }),
      200,
    )
  }
}

/** Assert a seeding call was accepted, failing with the body when it was not. */
async function expectCreated(pending: Promise<APIResponse>) {
  await expectStatus(pending, 201)
}

/** [expectCreated] for the endpoints that answer with something other than 201. */
async function expectStatus(pending: Promise<APIResponse>, status: number) {
  const response = await pending
  expect(response.status(), await response.text()).toBe(status)
}
