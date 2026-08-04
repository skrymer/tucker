import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { mintAccessToken } from '../../scripts/access-token.mjs'

// Global setup for the real-stack smoke suite: boot a fresh, disposable backend
// (issue #70).
//
// We own the container lifecycle explicitly instead of via Playwright's
// `webServer`, because `docker compose up` is daemon-managed: when Playwright
// kills the attached CLI on teardown the container survives, holding port 8080
// and its data for the next run. Here `--force-recreate` guarantees a brand-new
// container — and thus an empty, freshly-migrated database — even if a previous
// run left one behind, and the paired teardown removes it. See
// global-backend.teardown.ts.
const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const COMPOSE =
  'docker compose -f docker-compose.yml -f docker-compose.smoke.yml'
const READY_URL = 'http://localhost:8080/v3/api-docs'
const READY_TIMEOUT_MS = 120_000

async function globalSetup() {
  // The browser's own /api calls go through the Nuxt proxy, and the backend now
  // rejects anything without a verified Access assertion (ADR 0020). Nothing puts
  // one there — there is no Cloudflare in front of a smoke run — so hand the Nuxt
  // server the same pre-minted token `pnpm dev` uses, and its /api proxy attaches
  // it (server/routes/api/[...].ts). Set here rather than in the config because
  // minting is async and because workers, and the Nuxt server they start, inherit
  // this process's environment. It makes the smokes cover the dev credential path
  // as well as the gate.
  //
  // Deliberately not Playwright's `extraHTTPHeaders`: that would put the header on
  // *every* browser request, including cross-origin icon fetches, which then
  // preflight and fail. See support/smoke-test.ts.
  //
  // It also has to be *here* rather than in a `webServer`: Playwright runs webServer
  // plugins before globalSetup files, so a server started that way would come up
  // before this line and 401 every /api call with no obvious cause.
  process.env.TUCKER_DEV_ACCESS_TOKEN = await mintAccessToken({
    expiresIn: '12h',
  })

  execSync(`${COMPOSE} up --build --force-recreate -d backend`, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  })

  // Springdoc serves the OpenAPI doc once Spring Boot is fully up — a good
  // readiness signal (the container being "running" doesn't mean it's booted).
  for (let waited = 0; waited < READY_TIMEOUT_MS; waited += 1000) {
    try {
      const res = await fetch(READY_URL)
      if (res.ok) return
    } catch {
      // Connection refused while the JVM boots — keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  throw new Error(
    `Backend was not ready at ${READY_URL} within ${READY_TIMEOUT_MS / 1000}s`,
  )
}

export default globalSetup
