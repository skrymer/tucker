import type { components } from '#open-fetch-schemas/api'
import { CSRF_HEADER, readCsrfToken } from './csrf'

export type MetricEvent = components['schemas']['MetricEventRequest']

/**
 * Send [events] to Tucker's own backend, proving the page sent them (ADR 0025), and
 * say whether they were taken.
 */
export async function sendMetrics(
  events: MetricEvent[],
  transport: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await transport(new URL('/api/metrics', location.origin), {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        [CSRF_HEADER]: readCsrfToken(document.cookie) ?? '',
      },
      body: JSON.stringify({ events }),
    })
    return response.ok
  } catch {
    // Lossy and silent (ADR 0038): the User did not send this, so it is not theirs to see.
    return false
  }
}

/** As many as a send carries once enough are waiting. */
const FLUSH_AT = 20

/** Holds what Tucker measured until there is enough to send at once (ADR 0038). */
export function createMetricQueue(
  send: (events: MetricEvent[]) => Promise<unknown>,
) {
  let waiting: MetricEvent[] = []

  function flush() {
    if (waiting.length === 0) return
    const batch = waiting
    waiting = []
    void send(batch)
  }

  // A hidden page may never be shown again, so this is the last sure moment to send.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })

  return {
    record(event: MetricEvent) {
      waiting.push(event)
      if (waiting.length >= FLUSH_AT) flush()
    },
  }
}
