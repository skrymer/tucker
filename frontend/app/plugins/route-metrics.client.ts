import { createMetricQueue, sendMetrics } from '~/utils/metricQueue'
import { metricSource } from '~/utils/metricSource'
import {
  isApiCall,
  moveTiming,
  type ResourceTiming,
} from '~/utils/navigationSplit'
import { createRouteChangeTimer } from '~/utils/routeChangeTimer'
import { routeTemplate } from '~/utils/routeTemplate'

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

// Times each move between pages, splits it into where its time went, and queues it
// for Tucker's own backend (ADR 0038).
export default defineNuxtPlugin((nuxtApp) => {
  const { $api } = useNuxtApp()
  const queue = createMetricQueue((events) => sendMetrics($api, events))
  const router = useRouter()
  const { appVersion } = useRuntimeConfig().public
  const calls = createApiCallLog()

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
