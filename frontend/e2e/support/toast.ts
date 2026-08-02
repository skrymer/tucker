import type { Page } from '@playwright/test'

/**
 * The toast viewport. Its accessible name and the region → listitem structure
 * are Nuxt UI's, not ours, so they live here rather than in each spec that
 * asserts on a notification.
 */
export function toastRegion(page: Page) {
  return page.getByRole('region', { name: /notifications/i })
}

/**
 * The live toast whose title matches [title] — e.g. `toast(page, 'Entry logged')`.
 *
 * Scoped to the toast rather than the page because a toast's words are often
 * also on the page behind it: the entry-log success names the Entry with the
 * same `formatEntryName` string the Today row uses (ADR 0005), so an unscoped
 * `getByText` would match twice while the toast is up. Filtering by title also
 * leaves `toContainText` free to assert the description.
 *
 * Only one toast can be live at a time (`toaster.max` is 1), so this resolves
 * to a single element whenever it resolves at all.
 */
export function toast(page: Page, title: string) {
  return toastRegion(page).getByRole('listitem').filter({ hasText: title })
}
