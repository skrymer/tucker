import type { Page } from '@playwright/test'

/**
 * Both primary navigations. The side nav and the bottom tab bar are always both
 * in the DOM, hidden by breakpoint and both labelled "Primary", so a bare
 * `getByRole('link')` matches each destination twice.
 */
export function primaryNavs(page: Page) {
  return page.getByRole('navigation', { name: 'Primary' })
}

/** The one navigation the current viewport shows. */
export function visibleNav(page: Page) {
  return primaryNavs(page).filter({ visible: true })
}
