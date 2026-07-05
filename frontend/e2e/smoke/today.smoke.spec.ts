import { test, expect } from './support/smoke-test'

// Infrastructure smoke test: proves the SPA → /api proxy → real backend →
// SQLite path is wired. No mocks. If this fails, every other smoke test
// will fail too — fix this first.
test('Today page renders against the real backend', async ({ page, goto }) => {
  await goto('/', { waitUntil: 'hydration' })

  await expect(
    page.getByRole('heading', { name: 'Today', level: 1 }),
  ).toBeVisible()

  // A fresh DB has no weekly review, so the dashboard shows the no-budget
  // fallback. Once review-state setup exists, this assertion becomes
  // either/or — but for now its presence proves /api/summary returned real
  // data (not a 502 from a missing backend, not a mock).
  await expect(
    page.getByText(/No budget yet/).or(page.getByText(/\d+ \/ \d+ kcal/)),
  ).toBeVisible()
})
