import { createMetricQueue, sendMetrics } from '~/utils/metricQueue'
import { metricSource } from '~/utils/metricSource'
import { navigationSplit } from '~/utils/navigationSplit'
import { createRouteChangeTimer } from '~/utils/routeChangeTimer'
import { routeTemplate } from '~/utils/routeTemplate'

/**
 * The requests the page has made, as an observer hears of them: unlike the
 * browser's own list, which keeps 250 and drops the rest, it never fills. A move
 * reads only its own, so the log starts over as each one starts.
 */
function createRequestLog() {
  let entries: PerformanceEntry[] = []
  const observer = new PerformanceObserver((list) => {
    entries.push(...list.getEntries())
  })
  observer.observe({ type: 'resource' })
  return {
    clear() {
      observer.takeRecords()
      entries = []
    },
    /** A move's wait on the api and the server's part of it, in whole ms. */
    splitOf(window: { start: number; end: number }) {
      entries.push(...observer.takeRecords())
      const { apiMs, serverMs } = navigationSplit(
        entries as PerformanceResourceTiming[],
        window,
      )
      return { apiMs: Math.round(apiMs), serverMs: Math.round(serverMs) }
    },
  }
}

/** Whether each route is visited for the first time since the page loaded, when its code is fetched too. */
function createFirstVisits() {
  const visited = new Set<string>()
  return (route: string) => {
    const first = !visited.has(route)
    visited.add(route)
    return first
  }
}

// Times each move between pages, splits it into where its time went, and queues it
// for Tucker's own backend (ADR 0038).
export default defineNuxtPlugin((nuxtApp) => {
  const { $api } = useNuxtApp()
  const queue = createMetricQueue((events) => sendMetrics($api, events))
  const router = useRouter()
  const { appVersion } = useRuntimeConfig().public
  const isFirstVisit = createFirstVisits()
  const requests = createRequestLog()

  const timer = createRouteChangeTimer({
    now: () => performance.now(),
    // The frame after the one that mounted the page is the first one painted.
    afterPaint: (fn) => requestAnimationFrame(() => setTimeout(fn)),
    record: (matchedPath, { valueMs, start, end }) => {
      const route = routeTemplate(matchedPath)
      queue.record({
        kind: 'route-change',
        route,
        valueMs,
        ...requests.splitOf({ start, end }),
        firstVisit: isFirstVisit(route),
        ...metricSource(appVersion),
      })
    },
  })

  router.beforeEach(() => {
    requests.clear()
    timer.started()
  })
  nuxtApp.hook('page:finish', () =>
    timer.finished(router.currentRoute.value.matched.at(-1)?.path),
  )
})
