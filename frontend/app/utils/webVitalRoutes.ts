import { createRouteLog } from './routeLog'
import { routeTemplate } from './routeTemplate'
import {
  webVitalEvent,
  type WebVital,
  type WebVitalEvent,
} from './webVitalEvent'

/**
 * Hands each page load (LCP) and worst tap (INP) [take]n to [record], on the page
 * that was showing when it happened — told by [shown] as each page appears, since
 * the page before stays on screen while the next one loads its data.
 */
export function attributeWebVitals(
  record: (event: WebVitalEvent) => void,
  now: () => number,
) {
  const routes = createRouteLog()
  // One INP per visit: web-vitals reports it again on each hide where it grew.
  let interactionTaken = false
  return {
    shown(matchedPath: string | undefined) {
      if (matchedPath) routes.entered(routeTemplate(matchedPath), now())
    },
    take(vital: WebVital) {
      if (vital.name === 'INP' && interactionTaken) return
      const event = webVitalEvent(vital, routes.routeAt)
      if (!event) return
      if (event.kind === 'inp') interactionTaken = true
      record(event)
    },
  }
}
