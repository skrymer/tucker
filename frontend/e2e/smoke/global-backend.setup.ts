import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

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
