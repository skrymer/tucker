import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetPageStubs, setVisibility } from '~~/test/page-visibility-helpers'
import {
  createMetricQueue,
  sendMetrics,
  type ApiClient,
  type MetricEvent,
} from './metricQueue'

const event: MetricEvent = {
  kind: 'route-change',
  route: '/review',
  valueMs: 420,
  layout: 'phone',
  installed: false,
  appVersion: '1.4.0',
}

afterEach(() => resetPageStubs())

describe('the metric queue', () => {
  it('sends once 20 events are waiting, and not before', () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const queue = createMetricQueue(send)

    for (let i = 0; i < 19; i++) queue.record(event)
    expect(send).not.toHaveBeenCalled()

    queue.record(event)
    expect(send).toHaveBeenCalledExactlyOnceWith(Array(20).fill(event))
  })

  it('sends what is waiting when the page is hidden', () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const queue = createMetricQueue(send)
    queue.record(event)
    queue.record(event)

    hidePage()

    expect(send).toHaveBeenCalledExactlyOnceWith([event, event])
  })

  // The backend refuses an empty batch, and a request carrying nothing is waste.
  it('sends nothing when the page is hidden with nothing waiting', () => {
    const send = vi.fn().mockResolvedValue(undefined)
    createMetricQueue(send)

    hidePage()

    expect(send).not.toHaveBeenCalled()
  })

  // Lossy on purpose (ADR 0038): the User did not send a metric, so nothing about one
  // failing is theirs to see, and nothing is held back to try again.
  it('drops a batch whose send failed, quietly and for good', async () => {
    const send = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const queue = createMetricQueue(send)
    for (let i = 0; i < 20; i++) queue.record(event)
    await Promise.resolve()

    queue.record(event)
    hidePage()

    expect(send).toHaveBeenLastCalledWith([event])
  })
})

describe('sending metrics', () => {
  // Through Tucker's API client, whose plugins prove the page sent it (ADR 0025) as
  // they do every mutation. A stand-in client, since a fetch option never reaches a
  // mock server: a batch is mostly sent as the page is hidden, often for good, and
  // without keepalive the browser cancels it with the page.
  it('posts the batch through the API client, kept alive past the page and never retried', async () => {
    const api = vi.fn().mockResolvedValue(undefined)

    await sendMetrics(api as unknown as ApiClient, [event])

    expect(api).toHaveBeenCalledExactlyOnceWith('/api/metrics', {
      method: 'POST',
      body: { events: [event] },
      keepalive: true,
      retry: 0,
    })
  })

  // Lossy on purpose (ADR 0038): nothing about it is the User's to see.
  it('drops a send that failed, without throwing', async () => {
    const api = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(
      sendMetrics(api as unknown as ApiClient, [event]),
    ).resolves.toBeUndefined()
  })
})

function hidePage() {
  setVisibility('hidden')
}
