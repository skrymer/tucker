import {
  createMetricQueue,
  sendMetrics,
  type MetricEvent,
} from '~/utils/metricQueue'
import { metricSource } from '~/utils/metricSource'
import {
  isApiCall,
  moveTiming,
  type ResourceTiming,
} from '~/utils/navigationSplit'
import { createRouteChangeTimer } from '~/utils/routeChangeTimer'
import { routeTemplate } from '~/utils/routeTemplate'
import type { WebVitalEvent } from '~/utils/webVitalEvent'
import { attributeWebVitals } from '~/utils/webVitalRoutes'

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

function watchWebVitals(record: (event: WebVitalEvent) => void) {
  const vitals = attributeWebVitals(record, () => performance.now())
  // Off the first load's path: both report buffered entries once they start.
  void import('web-vitals').then(({ onLCP, onINP }) => {
    onLCP(vitals.take)
    onINP(vitals.take)
  })
  return vitals
}

/** A measurement before the page says where it was measured. */
type Measured = Omit<MetricEvent, keyof ReturnType<typeof metricSource>>

/** Times each move between pages and hands it to [record], split into where its time went. */
function timeMoves(record: (move: Measured) => void) {
  const calls = createApiCallLog()
  const timer = createRouteChangeTimer({
    now: () => performance.now(),
    // The frame after the one that mounted the page is the first one painted.
    afterPaint: (fn) => requestAnimationFrame(() => setTimeout(fn)),
    record: (matchedPath, { start, end, firstVisit }) =>
      record({
        kind: 'route-change',
        route: routeTemplate(matchedPath),
        ...calls.timingOf({ start, end }),
        firstVisit,
      }),
  })
  return {
    started() {
      calls.clear()
      timer.started()
    },
    finished: timer.finished,
  }
}

// Queues each move between pages, the page load and the worst tap for Tucker's own
// backend (ADR 0038).
export default defineNuxtPlugin((nuxtApp) => {
  const { $api } = useNuxtApp()
  const queue = createMetricQueue((events) => sendMetrics($api, events))
  const router = useRouter()
  const { appVersion } = useRuntimeConfig().public
  const send = (event: Measured) =>
    queue.record({ ...event, ...metricSource(appVersion) })
  const moves = timeMoves(send)
  const vitals = watchWebVitals(send)

  router.beforeEach(() => moves.started())
  // The page is showing now: the one before stayed up while this one loaded.
  nuxtApp.hook('page:finish', () => {
    const matchedPath = router.currentRoute.value.matched.at(-1)?.path
    moves.finished(matchedPath)
    vitals.shown(matchedPath)
  })
})
