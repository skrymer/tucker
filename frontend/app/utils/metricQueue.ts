import type { components } from '#open-fetch-schemas/api'
import type { NuxtApp } from '#app'

export type MetricEvent = components['schemas']['MetricEventRequest']

export type ApiClient = NuxtApp['$api']

/** Where metrics are sent, which a move's split leaves out of its wait. */
export const METRICS_PATH = '/api/metrics'

/**
 * Send [events] to Tucker's own backend through its API client, whose plugins prove
 * the page sent them (ADR 0025). Kept alive, since a batch is mostly sent as the page
 * is hidden, and never retried.
 */
export async function sendMetrics(
  api: ApiClient,
  events: MetricEvent[],
): Promise<void> {
  try {
    await api(METRICS_PATH, {
      method: 'POST',
      body: { events },
      keepalive: true,
      retry: 0,
    })
  } catch {
    // Lossy and silent (ADR 0038): the User did not send this, so it is not theirs to see.
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
