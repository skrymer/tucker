/**
 * When each route began to show, on the page's clock, so a moment reported later
 * (the worst tap, at hide) can be put back on the route it happened on.
 */
export function createRouteLog() {
  const entries: { route: string; at: number }[] = []
  return {
    entered(route: string, at: number) {
      entries.push({ route, at })
    },
    routeAt(at: number): string | undefined {
      return entries.findLast((entry) => entry.at <= at)?.route
    },
  }
}
