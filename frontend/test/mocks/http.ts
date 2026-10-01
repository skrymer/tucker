import { HttpResponse } from 'msw'
import { createOpenApiHttp } from 'openapi-msw'
import type { paths } from '#open-fetch-schemas/api'

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

/**
 * A read of [path] the server fails while [isDown] holds, falling through to the
 * handler under it once it does not. Every time, not once: ofetch retries a
 * failed GET by itself.
 */
export function failingRead(
  path:
    | '/api/foods'
    | '/api/foods/frequent'
    | '/api/tags'
    | '/api/reference-foods',
  isDown: () => boolean = () => true,
) {
  return http.get(path, ({ response }) =>
    isDown() ? response.untyped(serverError()) : undefined,
  )
}
