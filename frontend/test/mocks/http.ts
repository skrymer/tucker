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
