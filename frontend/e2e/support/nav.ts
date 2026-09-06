import type { Locator, Page } from '@playwright/test'

/** Tucker's `lg:` breakpoint — where the tab bar becomes a side rail. */
const DESKTOP_BREAKPOINT_PX = 1024

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

/**
 * The overflow destinations, wherever the current viewport keeps them: behind a
 * `More` button on phone, laid out in place in the side rail on desktop.
 *
 * Scoped rather than a plain getter, because reaching them on phone opens a
 * sheet over the page — a caller that had to remember to close it would leave
 * the next assertion looking at a dim. Branches on the viewport, not on whether
 * the button happens to be visible yet.
 */
export async function withOverflowNav(
  page: Page,
  assert: (nav: Locator) => Promise<void>,
) {
  const width = page.viewportSize()?.width ?? 0
  if (width >= DESKTOP_BREAKPOINT_PX) {
    await assert(visibleNav(page).getByRole('group', { name: 'More' }))
    return
  }
  await visibleNav(page).getByRole('button', { name: 'More' }).click()
  const sheet = page.getByRole('dialog', { name: 'More' })
  try {
    await assert(sheet)
  } finally {
    // Tolerant of the sheet having gone already: a caller that *follows* one of
    // these links has taken it with them, and the postcondition is only that
    // nothing is left dimming the page.
    await sheet
      .getByRole('button', { name: 'Close' })
      .click({ timeout: 2_000 })
      .catch(() => {})
    await sheet.waitFor({ state: 'hidden' })
  }
}
