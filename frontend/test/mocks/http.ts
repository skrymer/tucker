import { HttpResponse, http as untypedHttp } from 'msw'
import { createOpenApiHttp } from 'openapi-msw'
import type { paths } from '#open-fetch-schemas/api'
import { openGate } from '../async-gate'

/**
 * MSW's `http`, typed against the committed OpenAPI spec: a handler for a path,
 * query or response body the spec does not have fails `pnpm typecheck`.
 *
 * `baseUrl: '*'` matches the path on any origin — the Vitest shim makes every
 * `/api` call absolute against happy-dom's origin, and the mocked e2e build is
 * served from a free port.
 */
export const http = createOpenApiHttp<paths>({ baseUrl: '*' })

/**
 * An unexpected server failure, for `response.untyped(serverError())`: the spec
 * declares a 500 on no endpoint, because no endpoint means to answer one.
 */
export const serverError = () =>
  HttpResponse.json({ message: 'boom' }, { status: 500 })

/** The body of a 503: the server could not be reached. */
export const noConnection = { message: 'no connection to the server' }

/** A request as an uncovered-request failure names it: method, path, query. */
export function describeRequest(request: Request): string {
  const { pathname, search } = new URL(request.url)
  return `${request.method} ${pathname}${search}`
}

/**
 * The last handler in either layer, for an `/api` request every handler above
 * it let fall through. msw counts a handler that matched and returned nothing
 * as handled and sends the request on to the network, so no unhandled-request
 * callback ever sees it: this adds it to [uncovered] and fails it instead.
 */
export function fellThrough(uncovered: string[]) {
  return untypedHttp.all('*/api/*', ({ request }) => {
    uncovered.push(describeRequest(request))
    throw new Error(`no handler for ${describeRequest(request)}`)
  })
}

/**
 * A read of [path] the server fails while [isDown] holds, falling through to the
 * handler under it once it does not. Every time, not once: ofetch retries a
 * failed GET by itself.
 */
export function failingRead(
  path: Parameters<typeof http.get>[0],
  isDown: () => boolean = () => true,
) {
  return http.get(path, ({ response }) =>
    isDown() ? response.untyped(serverError()) : undefined,
  )
}

/**
 * [method] requests to [path] — those [matches] admits, if given — held until
 * `release()`, then passed to the handler under it, which must answer them.
 * `arrived` resolves once the first is held. [matches] reads a copy of the
 * request, so it may read the body the handler under it reads too.
 */
export function held(
  method: 'get' | 'post' | 'put' | 'delete',
  path: keyof paths,
  matches?: (request: Request) => boolean | Promise<boolean>,
) {
  const { gate, release } = openGate()
  let asked!: () => void
  const arrived = new Promise<void>((resolve) => (asked = resolve))
  const handler = untypedHttp[method](
    `*${path.replace(/\{(\w+)\}/g, ':$1')}`,
    async ({ request }) => {
      if (matches && !(await matches(request.clone()))) return undefined
      asked()
      await gate
      return undefined
    },
  )
  return { handler, arrived, release }
}
