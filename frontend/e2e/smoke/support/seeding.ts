import type { APIRequestContext, APIResponse } from '@playwright/test'
import { expect } from '@playwright/test'

const API = 'http://localhost:8080/api'

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

/** POSTs to the backend's [path], asserts 201, and returns the created row's id. */
export async function create(
  request: APIRequestContext,
  path: string,
  data: object,
): Promise<number> {
  const created = request.post(`${API}${path}`, { data })
  await expectCreated(created)
  return (await (await created).json()).id as number
}
