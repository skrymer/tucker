import type { APIRequestContext } from '@playwright/test'
import { test, expect } from './support/smoke-test'
import { isoShiftDays } from '../support/date'
import { earliestBirthDate, latestBirthDate } from '../../app/utils/birthDate'
import { localToday } from '../../app/utils/date'

/**
 * The birth-date bounds, driven against the real backend from the *client's* own
 * copy of them.
 *
 * The API is reachable without the SPA, so the picker's rule cannot be the only
 * one: `Profile.ageOn` uses `Period.between`, which counts a future birth date as
 * negative years and inflates the Mifflin-St Jeor seed, and with it Maintenance
 * and every Calorie Budget derived from it.
 *
 * Importing `latestBirthDate` / `earliestBirthDate` rather than restating the days
 * is what makes this a cross-stack check: the two stacks cannot import each other,
 * so nothing else fails when the calendar starts offering a day the API refuses
 * (or hiding one it allows). It catches drift in both directions — loosen either
 * side and the day that side now admits is judged by the other here.
 *
 * A deliberate exception to `e2e/support/date.ts` being the only home for date
 * construction (#85): the whole point is to read the *app's* days, so the bounds
 * and the `clientToday` they are judged against all come from `localToday`'s clock
 * rather than from `todayIso`'s UTC one. Mixing the two would make the spec pass or
 * fail on the runner's zone — at UTC+10 the app's yesterday *is* the UTC today, so
 * the first case would send a birth date of "today" and get the 400 it does not
 * expect. The server's ±1-day plausibility guard accepts any real zone's day.
 */
const PROFILE_URL = 'http://localhost:8080/api/profile'

// The day a birth date is judged against is the client's (ADR 0014), so every
// case supplies one.
const save = (request: APIRequestContext, birthDate: string) =>
  request.put(`${PROFILE_URL}?clientToday=${localToday()}`, {
    data: { sex: 'MALE', birthDate, heightCm: 180 },
  })

test('the API accepts the latest birth date the picker offers', async ({
  request,
}) => {
  const response = await save(request, latestBirthDate())

  expect(response.status()).toBe(200)
})

test("the API refuses a birth date of the client's today", async ({
  request,
}) => {
  const response = await save(request, isoShiftDays(latestBirthDate(), 1))

  expect(response.status()).toBe(400)
  // Nothing is persisted: a refused capture must not leave a Profile behind.
  expect((await request.get(PROFILE_URL)).status()).toBe(404)
})

test('the API accepts the earliest birth date the picker offers', async ({
  request,
}) => {
  const response = await save(request, earliestBirthDate())

  expect(response.status()).toBe(200)
})

test('the API refuses a birth date one day older than the picker allows', async ({
  request,
}) => {
  const response = await save(request, isoShiftDays(earliestBirthDate(), -1))

  expect(response.status()).toBe(400)
  expect((await request.get(PROFILE_URL)).status()).toBe(404)
})
