import { describe, expect, it } from 'vitest'
import type { WebVitalEvent } from './webVitalEvent'
import { attributeWebVitals } from './webVitalRoutes'

/** A clock the test moves, the attribution, and what got recorded. */
function visiting() {
  const clock = { now: 0 }
  const recorded: WebVitalEvent[] = []
  const vitals = attributeWebVitals(
    (event) => recorded.push(event),
    () => clock.now,
  )
  return { clock, recorded, ...vitals }
}

describe('a web vital put on the route it happened on', () => {
  it('puts a tap on the page showing then, not the one shown after', () => {
    const { clock, recorded, shown, take } = visiting()
    shown('/')
    clock.now = 1_000
    shown('/foods')

    take({ name: 'INP', value: 240, entries: [{ startTime: 500 }] })

    expect(recorded).toEqual([{ kind: 'inp', route: '/', valueMs: 240 }])
  })

  // Until the first page has its data, nothing else was ever on screen.
  it('puts a tap made while the first page loaded on that page', () => {
    const { clock, recorded, shown, take } = visiting()
    clock.now = 1_000
    shown('/')

    take({ name: 'INP', value: 240, entries: [{ startTime: 500 }] })

    expect(recorded).toEqual([{ kind: 'inp', route: '/', valueMs: 240 }])
  })

  it('names a page by its route template', () => {
    const { recorded, shown, take } = visiting()
    shown('/foods/:id(\\d+)')

    take({ name: 'INP', value: 240, entries: [{ startTime: 500 }] })

    expect(recorded).toEqual([
      { kind: 'inp', route: '/foods/[id]', valueMs: 240 },
    ])
  })

  // web-vitals reports INP again on each hide where it grew; a visit is one sample.
  it('records one interaction per visit, the first reported', () => {
    const { recorded, shown, take } = visiting()
    shown('/')

    take({ name: 'INP', value: 120, entries: [{ startTime: 500 }] })
    take({ name: 'INP', value: 400, entries: [{ startTime: 900 }] })

    expect(recorded).toEqual([{ kind: 'inp', route: '/', valueMs: 120 }])
  })

  it('sends no later interaction once the visit’s first could not be placed', () => {
    const { recorded, shown, take } = visiting()
    shown('/')

    take({ name: 'INP', value: 120, entries: [] })
    take({ name: 'INP', value: 400, entries: [{ startTime: 900 }] })

    expect(recorded).toEqual([])
  })

  it('records a page load reported after the visit’s interaction', () => {
    const { recorded, shown, take } = visiting()
    shown('/')

    take({ name: 'INP', value: 120, entries: [{ startTime: 500 }] })
    take({ name: 'LCP', value: 300, entries: [{ startTime: 300 }] })

    expect(recorded).toEqual([
      { kind: 'inp', route: '/', valueMs: 120 },
      { kind: 'lcp', route: '/', valueMs: 300 },
    ])
  })

  it('records an interaction reported after the visit’s page load', () => {
    const { recorded, shown, take } = visiting()
    shown('/')

    take({ name: 'LCP', value: 300, entries: [{ startTime: 300 }] })
    take({ name: 'INP', value: 120, entries: [{ startTime: 500 }] })

    expect(recorded).toEqual([
      { kind: 'lcp', route: '/', valueMs: 300 },
      { kind: 'inp', route: '/', valueMs: 120 },
    ])
  })

  it('records nothing for a tap whose moment is unknown', () => {
    const { recorded, shown, take } = visiting()
    shown('/')

    take({ name: 'INP', value: 240, entries: [] })

    expect(recorded).toEqual([])
  })

  // The error page a path no page matches shows has no route.
  it('keeps a tap on the last page with a route when one without is shown', () => {
    const { clock, recorded, shown, take } = visiting()
    shown('/')
    clock.now = 1_000
    shown(undefined)

    take({ name: 'INP', value: 240, entries: [{ startTime: 1_500 }] })

    expect(recorded).toEqual([{ kind: 'inp', route: '/', valueMs: 240 }])
  })
})
