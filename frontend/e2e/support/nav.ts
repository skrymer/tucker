import type { Page } from '@playwright/test'

/**
 * The one navigation the current viewport shows. Both are always in the DOM —
 * the side nav and the bottom tab bar, hidden by breakpoint and both labelled
 * "Primary" — so a bare `getByRole('link')` matches each destination twice.
 */
export function visibleNav(page: Page) {
  return page
    .getByRole('navigation', { name: 'Primary' })
    .filter({ visible: true })
}
