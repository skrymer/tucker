import { describe, expect, it } from 'vitest'

// The metric handlers stand for POST /api/metrics, so they take what the backend
// takes and refuse what it refuses: a mock stricter than the backend would fail a
// page the real stack answers, and a looser one would pass a page it refuses.

const event = {
  kind: 'route-change',
  route: '/review',
  valueMs: 420,
  apiMs: 300,
  serverMs: 120,
  firstVisit: false,
  layout: 'phone',
  installed: false,
  appVersion: '1.4.0',
}

async function statusOf(change: Record<string, unknown>): Promise<number> {
  const response = await fetch(new URL('/api/metrics', location.origin), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events: [{ ...event, ...change }] }),
  })
  return response.status
}

describe('the metric handlers', () => {
  it('take a decimal time, which the backend reads into an Int', async () => {
    expect(await statusOf({ valueMs: 420.5 })).toBe(204)
  })

  it('refuse an event that does not say whether the app is installed', async () => {
    expect(await statusOf({ installed: null })).toBe(400)
  })

  it('refuse a route change that does not say how long it waited on the api', async () => {
    expect(await statusOf({ apiMs: undefined })).toBe(400)
  })

  it('refuse a route change that does not say how long the server worked', async () => {
    expect(await statusOf({ serverMs: null })).toBe(400)
  })

  it("refuse a route change that does not say whether it was the route's first visit", async () => {
    expect(await statusOf({ firstVisit: undefined })).toBe(400)
  })

  it('refuse a negative server time', async () => {
    expect(await statusOf({ apiMs: 0, serverMs: -1 })).toBe(400)
  })

  it('refuse a server time longer than the api wait', async () => {
    expect(await statusOf({ apiMs: 300, serverMs: 301 })).toBe(400)
  })

  it('refuse an api wait longer than the move', async () => {
    expect(await statusOf({ valueMs: 420, apiMs: 421 })).toBe(400)
  })

  it('take a server time equal to the api wait, and an api wait equal to the move', async () => {
    expect(await statusOf({ valueMs: 300, apiMs: 300, serverMs: 300 })).toBe(
      204,
    )
  })
})
