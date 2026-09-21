import type { Locator, Page } from '@playwright/test'

/**
 * One row of Today's entry ledger, found by the name it states.
 *
 * Today states an Entry as a name over its figures (frontend/DESIGN.md → Figure
 * row), so there is no single string holding both and `getByText` cannot reach a
 * row. Scoped to `main` because the success toast carries the same words while it
 * is up (ADR 0005).
 *
 * Pass the name as Tucker states it, not as it was typed — a smoke that seeds
 * `remove 1731…` gets a row reading `Remove 1731…`.
 */
export function entryRow(page: Page, name: string): Locator {
  return page.getByRole('main').getByRole('listitem').filter({ hasText: name })
}
