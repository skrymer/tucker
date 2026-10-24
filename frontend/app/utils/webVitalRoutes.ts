import type { Router } from 'vue-router'
import { createRouteLog } from './routeLog'
import { routeTemplate } from './routeTemplate'
import {
  webVitalEvent,
  type WebVital,
  type WebVitalEvent,
} from './webVitalEvent'

/**
 * Takes each page load (LCP) and worst tap (INP) and hands it to [record], on the
 * route that was showing when it happened, which [router] logs as each move lands.
 */
export function attributeWebVitals(
  router: Router,
  record: (event: WebVitalEvent) => void,
  now: () => number,
) {
  const routes = createRouteLog()
  router.afterEach((to, _from, failure) => {
    const matchedPath = to.matched.at(-1)?.path
    if (matchedPath && !failure)
      routes.entered(routeTemplate(matchedPath), now())
  })
  return (vital: WebVital) => {
    const event = webVitalEvent(vital, routes.routeAt)
    if (event) record(event)
  }
}
