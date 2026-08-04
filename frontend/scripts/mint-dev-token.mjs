import { parseArgs } from 'node:util'
import { mintAccessToken } from './access-token.mjs'

// Prints one long-lived Access assertion for `pnpm dev`, which has no Cloudflare
// in front of it (ADR 0020). Copy it into frontend/.env as
// TUCKER_DEV_ACCESS_TOKEN and the /api proxy attaches it to every proxied
// request; see frontend/server/routes/api/[...].ts.
//
// What goes into .env is a *static string* — the token — never the key that
// signed it, so a dev environment can present an identity without being able to
// invent one.
//
//   node frontend/scripts/mint-dev-token.mjs
//   node frontend/scripts/mint-dev-token.mjs --email sonni@example.com --expires-in 30d
//
// The token alone reaches stdout, so it also composes:
//   TUCKER_DEV_ACCESS_TOKEN=$(node frontend/scripts/mint-dev-token.mjs)

const USAGE = `Usage: node frontend/scripts/mint-dev-token.mjs [options]
  --email <address>    who the token says you are (default: access-token.mjs's)
  --expires-in <span>  any jose duration, e.g. 30d, 12h (default: 365d)
`

// parseArgs rather than hand-rolled flag scanning: it rejects an unknown flag and
// a flag given no value, both of which a hand-rolled version accepts silently —
// and "silently minted a 1h token when you asked for 365d" is a confusing morning.
let values
try {
  ;({ values } = parseArgs({
    options: {
      email: { type: 'string' },
      'expires-in': { type: 'string', default: '365d' },
      help: { type: 'boolean', default: false },
    },
  }))
} catch (error) {
  process.stderr.write(`${error.message}\n\n${USAGE}`)
  process.exit(1)
}

if (values.help) {
  process.stderr.write(USAGE)
  process.exit(0)
}

// `email` is left undefined unless asked for, so the default identity stays
// stated once, in access-token.mjs.
const token = await mintAccessToken({
  email: values.email,
  expiresIn: values['expires-in'],
})

process.stdout.write(`${token}\n`)
process.stderr.write(
  '\nAdd to frontend/.env as:\n  TUCKER_DEV_ACCESS_TOKEN=<the line above>\n',
)
