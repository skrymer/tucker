import type { APIRequestContext } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Driving the Weekly-Review Reminder's hourly job from a smoke.
 *
 * The production trigger fires off the wall clock, so a smoke that wants to be at
 * somebody's reminder hour would otherwise be a test that only passes for one hour a
 * day. `POST /api/test/reminder-tick?at=` runs exactly one tick at a pinned instant
 * instead — smoke-profile only, like the rest of `TestSupportController`.
 *
 * Here rather than in each spec for the reason `off-stub.ts` gives: the endpoint's shape
 * is a contract with the backend, and one copy per smoke is one more thing to keep in
 * step with `TickResult` every time the job changes.
 */

const API = 'http://localhost:8080/api'

/** What one tick did: how many devices a reminder was delivered to. */
export interface TickResult {
  sent: number
}

/** A nudge as the service worker parses it off the wire. */
export interface PushPayload {
  title: string
  body: string
}

/**
 * Run one reminder tick as of [atInstant] (ISO-8601), as whoever [api] authenticates as.
 *
 * The instant is the *server's* now, not a User's local time — each User's own Profile
 * timezone turns it into their local hour, which is the whole point of pinning it.
 */
export async function tickAt(
  api: APIRequestContext,
  atInstant: string,
): Promise<TickResult> {
  const res = await api.post(`${API}/test/reminder-tick`, {
    params: { at: atInstant },
  })
  expect(res.ok(), await res.text()).toBe(true)
  return (await res.json()) as TickResult
}

/**
 * Every nudge sent since this test's reset, oldest first — what a smoke can see of the
 * words, which leave no trace in the database.
 *
 * Installation-wide, like `/api/test/push-subscriptions`; whose nudge said what is
 * asserted in `ReminderSchedulerIntegrationTest`.
 */
export async function sentPayloads(
  api: APIRequestContext,
): Promise<PushPayload[]> {
  const res = await api.get(`${API}/test/push-payloads`)
  expect(res.ok(), await res.text()).toBe(true)
  const raw = (await res.json()) as string[]
  return raw.map((json) => JSON.parse(json) as PushPayload)
}
