import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// Global teardown for the real-stack smoke suite: remove the smoke backend
// container so port 8080 is freed and no data-aged container can be reused next
// run (issue #70). The disposable database lives in the container's writable
// layer, so it dies with the container; `down` (without `-v`) preserves named
// volumes, leaving a developer's `tucker-data` untouched.
const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const COMPOSE =
  'docker compose -f docker-compose.yml -f docker-compose.smoke.yml'

function globalTeardown() {
  execSync(`${COMPOSE} down`, { cwd: REPO_ROOT, stdio: 'inherit' })
}

export default globalTeardown
