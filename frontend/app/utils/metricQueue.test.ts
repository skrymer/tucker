import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CSRF_COOKIE, CSRF_HEADER } from './csrf'
import { createMetricQueue, sendMetrics, type MetricEvent } from './metricQueue'

const event: MetricEvent = {
  kind: 'route-change',
  route: '/review',
  valueMs: 420,
  layout: 'phone',
  installed: false,
  appVersion: '1.4.0',
}

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
  beforeEach(() => {
    document.cookie = `${CSRF_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`
  })

  // Proving the request came from Tucker's own page is what every mutation owes
  // (ADR 0025), a metric included. The Vitest MSW shim carries no request headers,
  // so the transport is a stand-in that answers as the backend does.
  it('delivers a batch carrying the CSRF token Tucker handed out', async () => {
    document.cookie = `${CSRF_COOKIE}=token-abc`

    expect(await sendMetrics([event], backend)).toBe(true)
  })

  // A batch is mostly sent as the page is hidden, often for good. Without
  // keepalive the browser cancels the request with the page.
  it('sends a batch that outlives the page sending it', async () => {
    document.cookie = `${CSRF_COOKIE}=token-abc`
    const pageClosing: typeof fetch = async (input, init) =>
      init?.keepalive
        ? backend(input, init)
        : Promise.reject(new DOMException('cancelled', 'AbortError'))

    expect(await sendMetrics([event], pageClosing)).toBe(true)
  })

  it('says a send that never reached the server was not taken, without throwing', async () => {
    const offline: typeof fetch = () =>
      Promise.reject(new TypeError('Failed to fetch'))

    expect(await sendMetrics([event], offline)).toBe(false)
  })
})

/** Takes a send only as Spring does: proven by the token Tucker handed out. */
const backend: typeof fetch = async (_input, init) => {
  const proven = new Headers(init?.headers).get(CSRF_HEADER) === 'token-abc'
  return new Response(null, { status: proven ? 204 : 403 })
}

function hidePage() {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  document.dispatchEvent(new Event('visibilitychange'))
}
