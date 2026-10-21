import { describe, expect, it } from 'vitest'
import { navigationSplit, type ResourceTiming } from './navigationSplit'

/** An `/api` call from [startTime] to [responseEnd], its first byte at [responseStart]. */
function call(
  startTime: number,
  responseEnd: number,
  {
    path = '/api/summary',
    responseStart = responseEnd,
    server,
  }: {
    path?: string
    responseStart?: number
    server?: number
  } = {},
): ResourceTiming {
  return {
    name: `https://tucker.test${path}`,
    startTime,
    responseStart,
    responseEnd,
    serverTiming:
      server === undefined
        ? []
        : [
            {
              name: 'app',
              duration: server,
              description: '',
            } as PerformanceServerTiming,
          ],
  }
}

const window = { start: 0, end: 1_000 }

describe('splitting a move between pages', () => {
  it('counts two calls in flight at once as one wait', () => {
    const split = navigationSplit([call(100, 300), call(150, 350)], window)

    expect(split.apiMs).toBe(250)
  })

  it('adds up calls made one after another', () => {
    const split = navigationSplit([call(100, 300), call(400, 450)], window)

    expect(split.apiMs).toBe(250)
  })

  it('ignores a call made outside the move', () => {
    const split = navigationSplit(
      [call(-500, -100), call(100, 300), call(1_200, 1_400)],
      window,
    )

    expect(split.apiMs).toBe(200)
  })

  it("adds up the server's time on calls made one after another", () => {
    const split = navigationSplit(
      [
        call(100, 300, { responseStart: 280, server: 150 }),
        call(400, 450, { responseStart: 440, server: 30 }),
      ],
      window,
    )

    expect(split.serverMs).toBe(180)
  })

  // A plain sum would be 180 ms of server inside a 100 ms wait, which the backend refuses.
  it("counts the server's time on two calls in flight at once as one span", () => {
    const split = navigationSplit(
      [
        call(100, 200, { responseStart: 190, server: 90 }),
        call(100, 200, { responseStart: 190, server: 90 }),
      ],
      window,
    )

    expect(split).toEqual({ apiMs: 100, serverMs: 90 })
  })

  it('counts a call that states no server time as a wait, with none of it the server', () => {
    const split = navigationSplit(
      [call(100, 300), call(400, 450, { responseStart: 440, server: 30 })],
      window,
    )

    expect(split).toEqual({ apiMs: 250, serverMs: 30 })
  })

  // The backend refuses a server time longer than the wait, and the batch with it.
  it('never counts more of a call as the server than the call waited', () => {
    const split = navigationSplit(
      [call(100, 300, { responseStart: 150, server: 200 })],
      window,
    )

    expect(split.serverMs).toBe(50)
  })

  // Fetching a page's code is render time a first visit pays, never a wait on the api.
  it('counts only calls to the api', () => {
    const split = navigationSplit(
      [call(100, 300, { path: '/_nuxt/review.js' }), call(400, 450)],
      window,
    )

    expect(split.apiMs).toBe(50)
  })

  // A send of metrics is kept alive in the background: the page never waits on it.
  it('does not count sending what Tucker measured', () => {
    const split = navigationSplit(
      [call(100, 300, { path: '/api/metrics', server: 20 }), call(400, 450)],
      window,
    )

    expect(split).toEqual({ apiMs: 50, serverMs: 0 })
  })
})
