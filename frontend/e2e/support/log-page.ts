import type { Locator, Page } from '@playwright/test'

/**
 * What the control that logs a Food is called. Mirrors the app's own
 * `logFoodLabel` (app/utils/catalog.ts) — kept as a copy because e2e specs
 * can't resolve the app's `~/` import alias under Playwright's tsconfig, the
 * same reason `date.ts`'s `formatDmy` is one; keep the two in sync.
 */
function logFoodLabel(food: string, recipe: boolean): string {
  return recipe ? `Log ${food}, a recipe` : `Log ${food}`
}

/**
 * Pick a Food out of one of the **Log** destination's lists and return the
 * grams sheet it opens. The section is named because the Frequent Foods grid
 * and the catalog beneath it offer the same control for a Food in both.
 */
export async function pickFoodToLog(
  page: Page,
  options: { section: string; food: string; recipe?: boolean },
): Promise<Locator> {
  await page
    .getByRole('region', { name: options.section })
    .getByRole('button', {
      name: logFoodLabel(options.food, options.recipe ?? false),
    })
    .click()
  return page.getByRole('dialog', { name: `Log ${options.food}` })
}

/**
 * Weigh out a portion in an open log sheet, leaving the field so the value
 * commits: the number field commits its model on **blur**, so a submit without
 * the Tab reads the previous value — and `.fill()` does not reach it at all.
 */
export async function enterGrams(page: Page, sheet: Locator, grams: number) {
  await sheet.getByLabel(/weight \(g\)/i).click()
  await page.keyboard.type(String(grams))
  await page.keyboard.press('Tab')
}
