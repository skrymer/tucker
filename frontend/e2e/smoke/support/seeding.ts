import type { APIResponse } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Assert a seeding call was accepted, failing with the response body rather than
 * a bare `false !== true` — the difference between a one-minute and a twenty-minute
 * smoke debug when the backend refuses something a test took for granted.
 */
export async function expectStatus(
  pending: Promise<APIResponse>,
  status: number,
) {
  const response = await pending
  expect(response.status(), await response.text()).toBe(status)
}

/** [expectStatus] for the endpoints that answer 201. */
export async function expectCreated(pending: Promise<APIResponse>) {
  await expectStatus(pending, 201)
}
