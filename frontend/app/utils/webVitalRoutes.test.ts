import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { WebVitalEvent } from './webVitalEvent'
import { attributeWebVitals } from './webVitalRoutes'

const Page = { render: () => null }

/** A router over two pages, a clock the test moves, and what got recorded. */
function visiting() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Page },
      { path: '/foods', component: Page },
    ],
  })
  const clock = { now: 0 }
  const recorded: WebVitalEvent[] = []
  const take = attributeWebVitals(
    router,
    (event) => recorded.push(event),
    () => clock.now,
  )
  return { router, clock, recorded, take }
}

describe('a web vital put on the route it happened on', () => {
  it('puts a tap on the page the User was on, not the one they went to after', async () => {
    const { router, clock, recorded, take } = visiting()
    await router.push('/')
    clock.now = 1_000
    await router.push('/foods')

    take({ name: 'INP', value: 240, entries: [{ startTime: 500 }] })

    expect(recorded).toEqual([{ kind: 'inp', route: '/', valueMs: 240 }])
  })

  // web-vitals reports INP again on each hide where it grew; a visit is one sample.
  it('records one interaction per visit, the first reported', async () => {
    const { router, recorded, take } = visiting()
    await router.push('/')

    take({ name: 'INP', value: 120, entries: [{ startTime: 500 }] })
    take({ name: 'INP', value: 400, entries: [{ startTime: 900 }] })

    expect(recorded).toEqual([{ kind: 'inp', route: '/', valueMs: 120 }])
  })

  it('records a page load reported after the visit’s interaction', async () => {
    const { router, recorded, take } = visiting()
    await router.push('/')

    take({ name: 'INP', value: 120, entries: [{ startTime: 500 }] })
    take({ name: 'LCP', value: 300, entries: [{ startTime: 300 }] })

    expect(recorded).toEqual([
      { kind: 'inp', route: '/', valueMs: 120 },
      { kind: 'lcp', route: '/', valueMs: 300 },
    ])
  })

  it('records an interaction reported after the visit’s page load', async () => {
    const { router, recorded, take } = visiting()
    await router.push('/')

    take({ name: 'LCP', value: 300, entries: [{ startTime: 300 }] })
    take({ name: 'INP', value: 120, entries: [{ startTime: 500 }] })

    expect(recorded).toEqual([
      { kind: 'lcp', route: '/', valueMs: 300 },
      { kind: 'inp', route: '/', valueMs: 120 },
    ])
  })

  it('records nothing for a tap whose moment is unknown', async () => {
    const { router, recorded, take } = visiting()
    await router.push('/')

    take({ name: 'INP', value: 240, entries: [] })

    expect(recorded).toEqual([])
  })

  it('lets a move to a path no page matches land, and puts nothing on it', async () => {
    const { router, clock, recorded, take } = visiting()
    await router.push('/')
    clock.now = 1_000

    await expect(router.push('/nowhere')).resolves.toBeUndefined()
    take({ name: 'INP', value: 240, entries: [{ startTime: 1_500 }] })

    expect(recorded).toEqual([{ kind: 'inp', route: '/', valueMs: 240 }])
  })

  it('keeps a tap on the page still showing when a move to another was refused', async () => {
    const { router, clock, recorded, take } = visiting()
    router.beforeEach((to) => to.path !== '/foods')
    await router.push('/')
    clock.now = 1_000
    await router.push('/foods')

    take({ name: 'INP', value: 240, entries: [{ startTime: 1_500 }] })

    expect(recorded).toEqual([{ kind: 'inp', route: '/', valueMs: 240 }])
  })
})
