import type { Page } from '@playwright/test'
import { expect, test } from './support/test'
import { toast } from './support/toast'

/**
 * A browser whose push service cannot be reached. The permission prompt and the
 * service worker's PushManager are the true external boundary, so they are all
 * that is stubbed — and `subscribe()` rejects with the bare `AbortError`
 * DOMException the spec calls for, which is what Chrome really raises.
 */
async function stubUnreachablePushService(page: Page) {
  await page.addInitScript(() => {
    const pushManager = {
      getSubscription: async () => null,
      subscribe: async () => {
        throw new DOMException(
          'Registration failed - push service error',
          'AbortError',
        )
      },
    }
    Object.defineProperty(navigator.serviceWorker, 'ready', {
      configurable: true,
      get: () => Promise.resolve({ pushManager }),
    })
    window.Notification.requestPermission = async () => 'granted'
  })
}

test('says so when the push service cannot be reached, rather than snapping the toggle back in silence', async ({
  page,
  goto,
}) => {
  // The baseline User has reminders off and no push service to subscribe to,
  // so a subscription sent after the failure fails the test.
  await stubUnreachablePushService(page)

  await goto('/profile', { waitUntil: 'hydration' })
  await page.getByRole('switch', { name: /reminder/i }).click()

  // The switch is the confirmation on the way in (ADR 0005), so a failure that
  // said nothing would leave "it didn't work" indistinguishable from a mis-tap
  // — and the only other way to notice is never being reminded. Two mechanisms
  // now keep that promise, and this asserts the promise rather than either of
  // them: `useAsyncAction.test.ts` is where the classification itself is pinned.
  const failure = toast(page, 'Could not update reminders')
  await expect(failure).toBeVisible()
  await expect(failure.getByRole('button', { name: /retry/i })).toBeVisible()

  // And the switch still reflects reality: a failed enable never strands it on.
  await expect(
    page.getByRole('switch', { name: /reminder/i }),
  ).not.toBeChecked()
})
