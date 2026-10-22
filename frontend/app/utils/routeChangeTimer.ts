type Timing = {
  now: () => number
  /** Run [fn] once the browser has painted the frame being built. */
  afterPaint: (fn: () => void) => void
  record: (matchedPath: string, move: TimedMove) => void
}

/**
 * [start] and [end] on the `performance.now()` clock; [firstVisit] when no page at
 * this path has mounted since the page loaded.
 */
export type TimedMove = {
  start: number
  end: number
  firstVisit: boolean
}

function onHidden(fn: () => void) {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') fn()
  })
}

/** Whether each path is reached for the first time; every call after the first is not. */
function createFirstVisits() {
  const visited = new Set<string>()
  return (path: string) => {
    const first = !visited.has(path)
    visited.add(path)
    return first
  }
}

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
  const isFirstVisit = createFirstVisits()

  // A hidden page paints nothing until it is shown again, so a move still in
  // flight would be timed through the User's absence: it is dropped instead.
  onHidden(() => {
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
      if (!matchedPath) return
      // Counted on every page that mounts, timed or not: its code is fetched now.
      const firstVisit = isFirstVisit(matchedPath)
      if (start === null) return
      const hidesAtMount = hides
      afterPaint(() => {
        if (hides === hidesAtMount) {
          record(matchedPath, { start, end: now(), firstVisit })
        }
      })
    },
  }
}
