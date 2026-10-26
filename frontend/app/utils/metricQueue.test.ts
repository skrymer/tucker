import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetPageStubs, setVisibility } from '~~/test/page-visibility-helpers'
import { http, serverError } from '~~/test/mocks/http'
import { metricsRecorded, tooFew } from '~~/test/mocks/handlers/metrics'
import { server } from '~~/test/mocks/node'
import { createMetricQueue, sendMetrics, type MetricEvent } from './metricQueue'

const event: MetricEvent = {
  kind: 'route-change',
  route: '/review',
  valueMs: 420,
  apiMs: 300,
  serverMs: 120,
  firstVisit: false,
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

  it('holds what is waiting when the page is shown again', () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const queue = createMetricQueue(send)
    queue.record(event)

    setVisibility('visible')

    expect(send).not.toHaveBeenCalled()
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
  // they do every mutation; what was taken is read back as the Admin reads it.
  it('stores the batch it sends, counted on the Admin report', async () => {
    server.use(...metricsRecorded())
    const { $api } = useNuxtApp()

    await sendMetrics($api, [event])

    const { routes } = await $api('/api/admin/metrics')
    expect(routes).toEqual([
      {
        route: '/review',
        layouts: [tooFew('phone', 1), tooFew('desktop', 0)],
      },
    ])
  })

  // Lossy on purpose (ADR 0038): a failed send is neither thrown to the page nor
  // tried again, so a backend that would take it the second time never sees it.
  it('drops a send that failed, without throwing or trying again', async () => {
    // The failing answer first: within one use(), the first handler matches.
    server.use(
      http.post(
        '/api/metrics',
        ({ response }) => response.untyped(serverError()),
        { once: true },
      ),
      ...metricsRecorded(),
    )
    const { $api } = useNuxtApp()

    await expect(sendMetrics($api, [event])).resolves.toBeUndefined()

    expect((await $api('/api/admin/metrics')).routes).toEqual([])
  })

  // A User past their 600 events an hour is refused (ADR 0038), which is no more
  // theirs to see than any other failed send.
  it('drops a send refused as too many, without throwing or trying again', async () => {
    server.use(
      http.post(
        '/api/metrics',
        ({ response }) =>
          response(429).json({ message: 'no more than 600 events an hour' }),
        { once: true },
      ),
      ...metricsRecorded(),
    )
    const { $api } = useNuxtApp()

    await expect(sendMetrics($api, [event])).resolves.toBeUndefined()

    expect((await $api('/api/admin/metrics')).routes).toEqual([])
  })
})

function hidePage() {
  setVisibility('hidden')
}
