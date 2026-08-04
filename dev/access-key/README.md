# The non-production Access signing key

**This private key is deliberately public. It is not a secret, and leaking it costs
nothing.** It exists so that every environment verifies an Access assertion through the
*same* code path (ADR 0020, "One verification path in every environment"): production
points `NimbusJwtDecoder` at Cloudflare's team JWKS, and everything else points the same
decoder at `jwks.json` below.

The two halves live apart, and the split is the point — a *verifying* key is application
config, a *signing* key is a tool nothing in the image may hold:

| File | Half | Who reads it |
| --- | --- | --- |
| `backend/src/main/resources/access/jwks.json` | public | the backend, in every non-production environment, as `classpath:access/jwks.json`. Ships in the image, because a public key can only ever check a signature. |
| `dev/access-key/signing-key.json` | private | the Kotlin tests (Gradle copies it onto the **test** classpath), the Playwright smokes via `jose`, and `mint-dev-token.mjs`. Never inside `backend/src/main`, so it cannot reach the image. |

## Why committing a private key is safe here

The key's only power is to mint tokens that a *non-production* Tucker will accept. It has
no bearing on production, because production never loads it:

- The three `tucker.access.*` settings have **no defaults**. A backend with none of them
  set refuses to start rather than falling back to anything.
- `docker-compose.prod.yml` supplies all three from the host `.env` using compose's
  `${VAR:?}` form, so a production deploy missing them fails at compose-parse time —
  before a container exists — rather than quietly booting on this key.

Storing the key as JWK JSON rather than PEM also keeps it out of GitHub's secret-scanning
patterns, which key on the `-----BEGIN … PRIVATE KEY-----` armour.

## The issuer and audience it goes with

Non-production uses an issuer and audience that can never be confused with a real
Cloudflare team, and can never resolve:

```
issuer:   https://access.tucker.invalid
audience: tucker-dev
```

`.invalid` is reserved by [RFC 2606](https://www.rfc-editor.org/rfc/rfc2606) precisely so
it can never be registered.

## Minting a token

```bash
pnpm --dir frontend mint-token                      # a year-long token for pnpm dev
pnpm --dir frontend mint-token -- --help            # the other knobs
```

It lives under `frontend/` because `jose` — the only thing that signs anything here — is a
`frontend/` devDependency, and Node resolves it from the script's own directory upward.
`node frontend/scripts/mint-dev-token.mjs` works too, but only from the repo root, which is
not where you are when you run `pnpm dev`.

`pnpm dev` reads the result from `TUCKER_DEV_ACCESS_TOKEN`; see `frontend/.env.example`.
That script and `access-token.mjs` beside it are the only things in the repo that sign —
no shipped code path can mint a token, only verify one.

## Rotating it

Nothing reads the key's *value* from anywhere but the two files above, so rotating is:
regenerate the pair, then re-mint whatever tokens you had lying in a `.env`. There is no
tool for it, because it has never been needed — this is the whole procedure:

```bash
node --input-type=module -e '
import { webcrypto } from "node:crypto"
import { writeFileSync } from "node:fs"
const kid = "tucker-dev-access-key"
const { publicKey, privateKey } = await webcrypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true, ["sign", "verify"])
const jwk = async (k) => {
  const j = await webcrypto.subtle.exportKey("jwk", k)
  delete j.key_ops; delete j.ext
  return { kty: j.kty, use: "sig", alg: "RS256", kid, ...j }
}
writeFileSync("backend/src/main/resources/access/jwks.json",
  JSON.stringify({ keys: [await jwk(publicKey)] }, null, 2) + "\n")
writeFileSync("dev/access-key/signing-key.json",
  JSON.stringify(await jwk(privateKey), null, 2) + "\n")
'
pnpm --dir frontend mint-token              # then update frontend/.env
```

The halves must stay a matched pair — `kid` is what the decoder selects on — so write both
or neither. `./gradlew test` proves they match: every backend test mints with the private
half and verifies against the public one, so a mismatched pair fails the whole suite
immediately rather than subtly.
