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

/** [value] as Kotlin prints a Double in a refusal: `0.0`, never `0`. */
export const kotlinDouble = (value: number) =>
  Number.isInteger(value) ? value.toFixed(1) : String(value)

/** The body of a 503: the server could not be reached. */
export const noConnection = { message: 'no connection to the server' }

export const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The refusal for a request stamped with [given] when the test says it is
 * [today], or null when it is that day or no day was given. The real endpoints
 * refuse only a day implausibly far off; this stands in for a page that sent
 * the wrong one (ADR 0014).
 */
export function wrongDay(given: string | null | undefined, today?: string) {
  return today && given !== today ? { message: `${given} is not today` } : null
}

/** A window a windowed read asks about: both bounds inclusive, [days] wide. */
export type AskedWindow = { from: string; to: string; days: number }

/**
 * The window a windowed read's `from` and `to` ask about, or why it is refused:
 * a bound missing, or a window ending before it starts, as the backend refuses
 * them — and, given [today], a window ending on any other day, which the real
 * endpoint does not refuse, standing in for a page that asked about the wrong
 * day (ADR 0014).
 */
export function askedWindow(
  query: { get(name: 'from' | 'to'): string | null },
  { today }: { today?: string } = {},
): AskedWindow | { refused: string } {
  const from = query.get('from')
  const to = query.get('to')
  const days =
    from && to ? (Date.parse(to) - Date.parse(from)) / DAY_MS + 1 : NaN
  if (!from || !to || !(days >= 1)) {
    return { refused: 'a window must not end before it starts' }
  }
  const notToday = wrongDay(to, today)
  if (notToday) return { refused: notToday.message }
  return { from, to, days }
}

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
  return untypedHttp.all(
    ({ request }) => new URL(request.url).pathname.startsWith('/api/'),
    ({ request }) => {
      uncovered.push(describeRequest(request))
      throw new Error(`no handler for ${describeRequest(request)}`)
    },
  )
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
export function held<M extends 'get' | 'post' | 'put' | 'delete'>(
  method: M,
  path: Parameters<(typeof http)[M]>[0],
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
