import { describe, expect, it } from 'vitest'
import { createRouteLog } from './routeLog'
import { webVitalEvent } from './webVitalEvent'

function visits() {
  const log = createRouteLog()
  log.entered('/today', 100)
  log.entered('/foods', 3_000)
  return log
}

describe('a web vital as Tucker records it', () => {
  // An LCP's value is when its largest paint happened, on the page's own clock.
  it('puts a page load on the route showing when it painted, in whole ms', () => {
    expect(
      webVitalEvent({ name: 'LCP', value: 1_840.6 }, visits().routeAt),
    ).toEqual({
      kind: 'lcp',
      route: '/today',
      valueMs: 1_841,
    })
  })

  // INP is reported as the page hides, long after the tap and often routes away.
  it('puts an interaction on the route showing when the tap happened', () => {
    const tap = {
      name: 'INP' as const,
      value: 240,
      entries: [{ startTime: 2_500 }, { startTime: 2_520 }],
    }

    expect(webVitalEvent(tap, visits().routeAt)).toEqual({
      kind: 'inp',
      route: '/today',
      valueMs: 240,
    })
  })

  // web-vitals has no entry to time the tap by when the browser kept none.
  it('drops an interaction whose moment is unknown, rather than guess its route', () => {
    const tap = { name: 'INP' as const, value: 240, entries: [] }

    expect(webVitalEvent(tap, visits().routeAt)).toBeUndefined()
  })
})
