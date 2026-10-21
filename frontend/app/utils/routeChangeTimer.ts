type Timing = {
  now: () => number
  /** Run [fn] once the browser has painted the frame being built. */
  afterPaint: (fn: () => void) => void
  record: (matchedPath: string, valueMs: number) => void
}

/**
 * Times each move between pages, from the router starting it to the first paint
 * after the new page mounts (ADR 0038). The page a visit opens on is a page
 * load, not a move, redirects on the way to it included, so nothing is timed
 * until that first page has finished.
 */
export function createRouteChangeTimer({ now, afterPaint, record }: Timing) {
  let startedAt: number | null = null
  let opened = false

  return {
    started() {
      startedAt = opened ? now() : null
    },
    /** The new page has mounted, at [matchedPath] in the router's spelling. */
    finished(matchedPath?: string) {
      const start = startedAt
      startedAt = null
      opened = true
      if (start === null || !matchedPath) return
      afterPaint(() => record(matchedPath, Math.round(now() - start)))
    },
  }
}
