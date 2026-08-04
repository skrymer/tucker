import { describe, expect, it, afterEach } from 'vitest'
import type { H3Event } from 'h3'
import { devAccessAssertion } from './[...]'

// The /api proxy stands in for Cloudflare when `pnpm dev` runs with nothing in front of
// it. The rule worth pinning is the *fallback*, not the attachment: h3 merges these
// headers with `set`, so returning one unconditionally would overwrite a real Access
// assertion rather than fill in for a missing one. Nothing else covers this — the mocked
// e2e suite never sets the env var, the smokes deliberately keep the header off the
// browser, and production sets neither — so without this test the guard could be deleted
// and every suite would stay green.
const eventCarrying = (headers: Record<string, string>) =>
  ({ node: { req: { headers } } }) as unknown as H3Event

describe('the dev Access assertion', () => {
  const original = process.env.TUCKER_DEV_ACCESS_TOKEN

  afterEach(() => {
    if (original === undefined) delete process.env.TUCKER_DEV_ACCESS_TOKEN
    else process.env.TUCKER_DEV_ACCESS_TOKEN = original
  })

  it('is attached when the request carries none', () => {
    process.env.TUCKER_DEV_ACCESS_TOKEN = 'dev-token'

    expect(devAccessAssertion(eventCarrying({}))).toEqual({
      headers: { 'cf-access-jwt-assertion': 'dev-token' },
    })
  })

  it('defers to an assertion the request already carries', () => {
    process.env.TUCKER_DEV_ACCESS_TOKEN = 'dev-token'

    const assertion = devAccessAssertion(
      eventCarrying({ 'cf-access-jwt-assertion': 'the-real-one' }),
    )

    expect(assertion).toBeUndefined()
  })

  it('is absent entirely when no dev token is configured', () => {
    delete process.env.TUCKER_DEV_ACCESS_TOKEN

    expect(devAccessAssertion(eventCarrying({}))).toBeUndefined()
  })
})
