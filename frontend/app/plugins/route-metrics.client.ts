import { createMetricQueue, sendMetrics } from '~/utils/metricQueue'
import { metricSource } from '~/utils/metricSource'
import { createRouteChangeTimer } from '~/utils/routeChangeTimer'
import { routeTemplate } from '~/utils/routeTemplate'

// Times each move between pages and queues it for Tucker's own backend (ADR 0038).
export default defineNuxtPlugin((nuxtApp) => {
  const { $api } = useNuxtApp()
  const queue = createMetricQueue((events) => sendMetrics($api, events))
  const router = useRouter()
  const { appVersion } = useRuntimeConfig().public

  const timer = createRouteChangeTimer({
    now: () => performance.now(),
    // The frame after the one that mounted the page is the first one painted.
    afterPaint: (fn) => requestAnimationFrame(() => setTimeout(fn)),
    record: (matchedPath, valueMs) =>
      queue.record({
        kind: 'route-change',
        route: routeTemplate(matchedPath),
        valueMs,
        ...metricSource(appVersion),
      }),
  })

  router.beforeEach(() => timer.started())
  nuxtApp.hook('page:finish', () =>
    timer.finished(router.currentRoute.value.matched.at(-1)?.path),
  )
})
