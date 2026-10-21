import type { Page } from '@playwright/test'

/**
 * What a browser does as the User switches away: the page reports itself hidden,
 * then visible again. Not before the page on screen has painted, which a User
 * looking at it has seen.
 */
export async function hidePage(page: Page) {
  await page.evaluate(async () => {
    await new Promise((painted) =>
      requestAnimationFrame(() => setTimeout(painted)),
    )
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
  })
}
