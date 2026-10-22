import { describe, expect, it } from 'vitest'
import { server } from './node'
import { metricsBy, metricsRecorded } from './handlers/metrics'

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

async function reportOf(query: string): Promise<Response> {
  return fetch(new URL(`/api/admin/metrics?${query}`, location.origin))
}

// GET /api/admin/metrics refuses an Admin's filter the backend cannot read, and
// says why in the backend's own words.
describe('the report handler', () => {
  it('refuses a range the backend does not offer', async () => {
    const response = await reportOf('range=1y')

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ message: '"1y" is not a range' })
  })

  it('refuses a browser engine the backend does not tell apart', async () => {
    const response = await reportOf('engine=safari')

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      message: '"safari" is not a browser engine',
    })
  })

  it('says, when moves were recorded, that it cannot filter them by engine', async () => {
    server.use(...metricsRecorded())

    const response = await reportOf('engine=webkit')

    expect(response.status).toBe(501)
    expect(await response.json()).toEqual({
      message: 'metricsRecorded reads no engine; use metricsBy',
    })
  })

  it('takes a blank range or engine as no filter, as the backend does', async () => {
    expect((await reportOf('range=')).status).toBe(200)
    expect((await reportOf('engine=')).status).toBe(200)
  })

  it('narrows nothing by a blank app version, as the backend does', async () => {
    server.use(
      metricsBy(({ version }) =>
        version === null ? [{ route: '/review', layouts: [] }] : [],
      ),
    )

    const response = await reportOf('version=')

    expect((await response.json()).routes).toHaveLength(1)
  })

  it('narrows nothing by an app version of spaces alone, as the backend does', async () => {
    server.use(
      metricsBy(({ version }) =>
        version === null ? [{ route: '/review', layouts: [] }] : [],
      ),
    )

    const response = await reportOf('version=%20%20')

    expect((await response.json()).routes).toHaveLength(1)
  })

  it('takes an installed flag in any spelling Spring binds a Boolean from', async () => {
    expect((await reportOf('installed=%20Yes%20')).status).toBe(200)
  })

  it('refuses an installed filter that is neither true nor false', async () => {
    const response = await reportOf('installed=maybe')

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      message: 'installed must be true or false, not "maybe"',
    })
  })
})
