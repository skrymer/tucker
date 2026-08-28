import { createServer } from 'node:http'
import type { ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { NETWORK_ONLY_PREFIXES } from '../../app/utils/exits'

/** A running stand-in origin: where it listens, and how to stop it. */
export interface ExpiredAccessOrigin {
  url: string
  close: () => Promise<void>
}

/** Cloudflare's own reserved namespace, which its edge serves rather than gates. */
const ACCESS_NAMESPACE = '/cdn-cgi/'
const LOGIN_PATH = `${ACCESS_NAMESPACE}access/login/tucker`

/**
 * The response headers a relayed request keeps. `content-encoding` and
 * `content-length` are dropped because `fetch` has already decoded the body, so
 * they would describe bytes that no longer exist — and `cache-control` with
 * them, so this origin can express the session but not caching (ADR 0011).
 */
const CARRIED_HEADERS = ['content-type', 'location']

/**
 * Serve the app under test the way the deployed origin serves it once the
 * Cloudflare Access session has expired: the paths the service worker must
 * never answer from cache ([NETWORK_ONLY_PREFIXES]) are met at the edge — a 302
 * to Access's login page, and that login page for Access's own namespace —
 * while everything else is relayed from [appOrigin] as a bare GET.
 *
 * A real redirect from a real server is the whole point. `route.fulfill` with a
 * 3xx reaches the page as `net::ERR_ABORTED`, not as the resolved opaque
 * response `redirect: 'manual'` produces, so page-level interception cannot
 * express this state at all (app/plugins/auth-gate.client.ts).
 */
export async function serveWithExpiredAccessSession(
  appOrigin: string,
): Promise<ExpiredAccessOrigin> {
  // `request.url` always starts with `/`, so a trailing slash here would relay
  // every asset to a doubled `//_nuxt/…` and get the SPA fallback HTML back.
  const app = appOrigin.replace(/\/+$/, '')

  const server = createServer((request, response) => {
    const path = request.url ?? '/'
    if (!NETWORK_ONLY_PREFIXES.some((prefix) => prefix.test(path))) {
      // Answered rather than left to reject: an unhandled rejection here takes
      // the whole Playwright worker down with it, and strands the browser on a
      // request that is never ended.
      relay(app + path, response).catch(() => respond(response, 502))
      return
    }
    if (path.startsWith(ACCESS_NAMESPACE)) {
      respond(response, 200, '<h1>Sign in</h1>', {
        'content-type': 'text/html',
      })
      return
    }
    respond(response, 302, undefined, { location: LOGIN_PATH })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
        // `close` alone resolves only once every open connection has ended, and
        // a keep-alive socket holds one open for as long as it likes.
        server.closeAllConnections()
      }),
  }
}

/** Relay one request to the app, carrying [CARRIED_HEADERS] and the status. */
async function relay(url: string, response: ServerResponse): Promise<void> {
  const upstream = await fetch(url, { redirect: 'manual' })
  const body = Buffer.from(await upstream.arrayBuffer())
  const headers = Object.fromEntries(
    CARRIED_HEADERS.map((name) => [name, upstream.headers.get(name)]).filter(
      ([, value]) => value !== null,
    ),
  )
  respond(response, upstream.status, body, headers as Record<string, string>)
}

function respond(
  response: ServerResponse,
  status: number,
  body?: Buffer | string,
  headers: Record<string, string> = {},
): void {
  // A relay that loses its race with teardown would otherwise write to a socket
  // the server has already destroyed.
  if (response.writableEnded || response.destroyed) return
  response.writeHead(status, headers)
  response.end(body)
}
