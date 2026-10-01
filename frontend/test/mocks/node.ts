import { afterAll, afterEach, beforeAll } from 'vitest'
import { setupServer } from 'msw/node'
import { createFetch } from 'ofetch'
import { handlers } from './handlers'

/** The Vitest server, holding the baseline. A test overrides it with `server.use()`. */
export const server = setupServer(...handlers)

const unhandled: string[] = []

/**
 * Throw naming every request no handler covered since the last call, then forget
 * them. Run after each test, so a page that catches the failed request still
 * fails its test.
 */
export function assertNoUnhandledRequests(): void {
  const requests = unhandled.splice(0)
  if (requests.length > 0) {
    throw new Error(`requests no MSW handler covers: ${requests.join(', ')}`)
  }
}

type Fetch = typeof globalThis.fetch

/**
 * Answer `/api` calls from the MSW baseline for every test in this file, and fail
 * any request no handler covers. Call once at the top of an opted-in test file.
 *
 * Stock `setupServer` cannot reach a request under `environment: 'nuxt'` alone:
 * Nuxt's test `fetch` answers an unregistered relative URL with a 404 before the
 * network, and msw 3 hands Node's `fetch` a happy-dom `Request`, which it cannot
 * read. So `fetch` is wrapped to unwrap that `Request`, and `$fetch` is rebound to
 * resolve `/api/*` against the page's origin (ADR 0034).
 */
export function useMswServer() {
  let nuxtFetch: Fetch
  let nuxt$fetch: typeof globalThis.$fetch

  beforeAll(() => {
    nuxtFetch = globalThis.fetch
    nuxt$fetch = globalThis.$fetch
    globalThis.fetch = unwrapRequests(nuxtFetch)
    server.listen({
      onUnhandledFrame: ({ frame }) => {
        const { request } = frame.data as { request: Request }
        const { pathname, search } = new URL(request.url)
        unhandled.push(`${request.method} ${pathname}${search}`)
        throw new Error(`no handler for ${request.method} ${pathname}`)
      },
    })
    globalThis.$fetch = createFetch({
      fetch: globalThis.fetch,
      defaults: { baseURL: location.origin },
    }) as typeof nuxt$fetch
  })

  afterEach(() => {
    server.resetHandlers()
    assertNoUnhandledRequests()
  })

  afterAll(() => {
    server.close()
    globalThis.fetch = nuxtFetch
    globalThis.$fetch = nuxt$fetch
  })
}

/**
 * Hand Nuxt's `fetch` a URL and an init rather than happy-dom's `Request`, and
 * send a path still registered through `registerEndpoint` to Nuxt's handler, which
 * only recognises it relative — that also covers the app manifest Nuxt registers
 * for itself.
 */
function unwrapRequests(nuxtFetch: Fetch): Fetch {
  const viaNuxt = (url: string, init?: RequestInit) => {
    const registry = (window as unknown as { __registry: Set<string> })
      .__registry
    if (url.startsWith(location.origin)) {
      const relative = url.slice(location.origin.length)
      if (registry.has(relative.split('?')[0]!) || registry.has(relative)) {
        return nuxtFetch(relative, init)
      }
    }
    return nuxtFetch(url, init)
  }

  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (input instanceof Request) {
      const body = ['GET', 'HEAD'].includes(input.method)
        ? undefined
        : await input.arrayBuffer()
      return abortable(
        viaNuxt(input.url, {
          method: input.method,
          headers: input.headers,
          body,
          ...init,
        }),
        input.signal,
      )
    }
    return viaNuxt(input instanceof URL ? input.href : input, init)
  }) as Fetch
}

/**
 * Reject when [signal] aborts, as a browser's `fetch` does. The signal is
 * happy-dom's, which Node's `fetch` refuses, so it cannot be handed on.
 */
function abortable(
  response: Promise<Response>,
  signal: AbortSignal,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const abort = () =>
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
    if (signal.aborted) return abort()
    signal.addEventListener('abort', abort, { once: true })
    response.then(resolve, reject)
  })
}
