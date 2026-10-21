type Timing = {
  now: () => number
  /** Run [fn] once the browser has painted the frame being built. */
  afterPaint: (fn: () => void) => void
  /** [start] and [end] on the `performance.now()` clock, [valueMs] the whole ms between. */
  record: (matchedPath: string, move: TimedMove) => void
}

export type TimedMove = { valueMs: number; start: number; end: number }

/**
 * Times each move between pages, from the router starting it to the first paint
 * after the new page mounts (ADR 0038). The page a visit opens on is a page
 * load, not a move, redirects on the way to it included, so nothing is timed
 * until that first page has finished. A move the page is hidden for at any point
 * is dropped, since its clock would run on through the User's absence.
 */
export function createRouteChangeTimer({ now, afterPaint, record }: Timing) {
  let startedAt: number | null = null
  let opened = false
  // Counts the page's hides, so a paint can tell it was hidden on the way.
  let hides = 0

  // A hidden page paints nothing until it is shown again, so a move still in
  // flight would be timed through the User's absence: it is dropped instead.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return
    startedAt = null
    hides++
  })

  return {
    started() {
      const visible = document.visibilityState !== 'hidden'
      startedAt = opened && visible ? now() : null
    },
    /** The new page has mounted, at [matchedPath] in the router's spelling. */
    finished(matchedPath?: string) {
      const start = startedAt
      startedAt = null
      opened = true
      if (start === null || !matchedPath) return
      const hidesAtMount = hides
      afterPaint(() => {
        if (hides === hidesAtMount) {
          const end = now()
          record(matchedPath, { valueMs: Math.round(end - start), start, end })
        }
      })
    },
  }
}
