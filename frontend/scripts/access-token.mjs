import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { importJWK, SignJWT } from 'jose'

// Mints the assertion Cloudflare Access would sign, using the committed
// non-production key (see dev/access-key/README.md). Shared by the smoke suite,
// which mints per test, and mint-dev-token.mjs, which mints one long-lived token
// for `pnpm dev` — so there is a single place that has to agree with the
// backend's tucker.access.* settings.
//
// Nothing here ships: the private half lives outside every packaged tree, and no
// application code path can reach it. Tucker only ever *verifies* a token.

/** Matches `tucker.access.issuer` outside production. `.invalid` can never resolve. */
export const ACCESS_ISSUER = 'https://access.tucker.invalid'

/** Matches `tucker.access.audience` outside production — a stand-in for the AUD tag. */
export const ACCESS_AUDIENCE = 'tucker-dev'

/** The header Cloudflare Access signs its assertion into. */
export const ACCESS_ASSERTION_HEADER = 'Cf-Access-Jwt-Assertion'

const SIGNING_KEY = fileURLToPath(
  new URL('../../dev/access-key/signing-key.json', import.meta.url),
)

/**
 * @param {{ email?: string, expiresIn?: string }} [options]
 * @returns {Promise<string>} a signed Access assertion
 */
export async function mintAccessToken(options = {}) {
  const { email = 'tester@tucker.invalid', expiresIn = '1h' } = options
  const jwk = JSON.parse(readFileSync(SIGNING_KEY, 'utf8'))
  return new SignJWT({ email })
    .setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
    .setIssuer(ACCESS_ISSUER)
    .setAudience(ACCESS_AUDIENCE)
    .setSubject('access-subject')
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(await importJWK(jwk, 'RS256'))
}
