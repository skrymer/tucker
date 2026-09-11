import type { Page } from '@playwright/test'
import { INSTALL_OFFER_EVENT } from '../../app/utils/installEvents'

/**
 * Dispatch the browser's `beforeinstallprompt` at [page]. Chromium only fires it
 * once its install criteria are met, which neither the preview server nor the
 * smoke stack satisfies. Call it **after** the app has booted — the capture that
 * receives it starts with the app, not with the page.
 *
 * The Vitest twin is `fakeInstallEvent` in `test/pwa-install-helpers.ts`; the two
 * are separate because a `page.evaluate` body runs in the browser and can import
 * nothing, which is why the event name is passed in rather than written again.
 */
export async function offerInstall(page: Page) {
  await page.evaluate((eventName) => {
    const event = new Event(eventName) as Event & {
      prompt: () => Promise<void>
    }
    event.prompt = () => Promise.resolve()
    window.dispatchEvent(event)
  }, INSTALL_OFFER_EVENT)
}
