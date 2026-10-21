import { describe, expect, it } from 'vitest'

// The metric handlers stand for POST /api/metrics, so they take what the backend
// takes and refuse what it refuses: a mock stricter than the backend would fail a
// page the real stack answers, and a looser one would pass a page it refuses.

const event = {
  kind: 'route-change',
  route: '/review',
  valueMs: 420,
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
})
