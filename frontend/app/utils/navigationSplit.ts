/** What a navigation split reads of one Resource Timing entry. */
export type ResourceTiming = Pick<
  PerformanceResourceTiming,
  'name' | 'startTime' | 'responseStart' | 'responseEnd' | 'serverTiming'
>

type Span = [from: number, to: number]

/** How long [spans] cover between them, an overlap counted once. */
function unionLength(spans: Span[]): number {
  let covered = 0
  let reached = -Infinity
  for (const [from, to] of [...spans].sort((a, b) => a[0] - b[0])) {
    covered += Math.max(0, to - Math.max(from, reached))
    reached = Math.max(reached, to)
  }
  return covered
}

/**
 * When the server worked on a call: its `app` duration, ending as the first byte
 * leaves, since the server answers once it is done.
 */
function serverSpan(entry: ResourceTiming): Span {
  const app = entry.serverTiming.find((t) => t.name === 'app')?.duration ?? 0
  return [
    Math.max(entry.startTime, entry.responseStart - app),
    entry.responseStart,
  ]
}

/**
 * How long a move between pages waited on `/api`, and how much of that the server
 * spent working (ADR 0038), from the Resource Timing entries in its window.
 */
export function navigationSplit(
  entries: readonly ResourceTiming[],
  window: { start: number; end: number },
): { apiMs: number; serverMs: number } {
  // Only the part of a wait that falls inside the move is the move's.
  const within = ([from, to]: Span): Span => [
    Math.max(from, window.start),
    Math.min(to, window.end),
  ]
  const calls = entries.filter((e) => {
    const path = new URL(e.name).pathname
    return path.startsWith('/api/') && path !== '/api/metrics'
  })
  return {
    apiMs: unionLength(calls.map((e) => within([e.startTime, e.responseEnd]))),
    serverMs: unionLength(calls.map((e) => within(serverSpan(e)))),
  }
}
