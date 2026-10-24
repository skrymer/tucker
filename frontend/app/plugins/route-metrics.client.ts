import { onINP, onLCP } from 'web-vitals/attribution'
import { createMetricQueue, sendMetrics } from '~/utils/metricQueue'
import { metricSource } from '~/utils/metricSource'
import {
  isApiCall,
  moveTiming,
  type ResourceTiming,
} from '~/utils/navigationSplit'
import { createRouteChangeTimer } from '~/utils/routeChangeTimer'
import { createRouteLog } from '~/utils/routeLog'
import { routeTemplate } from '~/utils/routeTemplate'
import { webVitalEvent, type WebVital } from '~/utils/webVitalEvent'

/**
 * The api calls the page has made, as an observer hears of them: unlike the
 * browser's own list, which keeps 250 entries and drops the rest, it never fills.
 * A move reads only its own, so the log starts over as each one starts.
 */
function createApiCallLog() {
  let calls: ResourceTiming[] = []
  const observer = new PerformanceObserver((list) => keep(list.getEntries()))
  observer.observe({ type: 'resource' })
  // A `resource` observer is handed resource entries alone.
  function keep(entries: PerformanceEntry[]) {
    calls.push(...(entries as PerformanceResourceTiming[]).filter(isApiCall))
  }
  return {
    clear() {
      observer.takeRecords()
      calls = []
    },
    timingOf(window: { start: number; end: number }) {
      keep(observer.takeRecords())
      return moveTiming(calls, window)
    },
  }
}

/**
 * Hands each page load (LCP) and worst tap (INP) to [record], on the route that was
 * showing when it happened, which the router logs as each route starts.
 */
function watchWebVitals(
  record: (event: NonNullable<ReturnType<typeof webVitalEvent>>) => void,
) {
  const routes = createRouteLog()
  useRouter().beforeEach((to) => {
    const matchedPath = to.matched.at(-1)?.path
    if (matchedPath)
      routes.entered(routeTemplate(matchedPath), performance.now())
  })
  const take = (vital: WebVital) => {
    const event = webVitalEvent(vital, routes.routeAt)
    if (event) record(event)
  }
  onLCP(take)
  onINP(take)
}

// Times each move between pages, splits it into where its time went, and queues it
// for Tucker's own backend (ADR 0038), with the page load and the worst tap.
export default defineNuxtPlugin((nuxtApp) => {
  const { $api } = useNuxtApp()
  const queue = createMetricQueue((events) => sendMetrics($api, events))
  const router = useRouter()
  const { appVersion } = useRuntimeConfig().public
  const calls = createApiCallLog()
  watchWebVitals((vital) =>
    queue.record({ ...vital, ...metricSource(appVersion) }),
  )

  const timer = createRouteChangeTimer({
    now: () => performance.now(),
    // The frame after the one that mounted the page is the first one painted.
    afterPaint: (fn) => requestAnimationFrame(() => setTimeout(fn)),
    record: (matchedPath, { start, end, firstVisit }) =>
      queue.record({
        kind: 'route-change',
        route: routeTemplate(matchedPath),
        ...calls.timingOf({ start, end }),
        firstVisit,
        ...metricSource(appVersion),
      }),
  })

  router.beforeEach(() => {
    calls.clear()
    timer.started()
  })
  nuxtApp.hook('page:finish', () =>
    timer.finished(router.currentRoute.value.matched.at(-1)?.path),
  )
})
