import type { Page } from '@playwright/test'
import { test, expect } from './support/smoke-test'

// F6 slice 2 smoke (issue #81): enabling the Weekly-Review Reminder against the
// real stack. Toggling on persists a Push Subscription and saves the reminder
// preferences on the Profile; the iOS-not-installed path shows the install hint
// and subscribes nothing. Runs at both viewports (Desktop + Mobile Chrome).

const API = 'http://localhost:8080/api'
const PROFILE_URL = `${API}/profile`
const SUBSCRIPTIONS_URL = `${API}/test/push-subscriptions`
const DEVICE_ENDPOINT = 'https://push.example/smoke-device'

async function seedProfile(
  request: import('@playwright/test').APIRequestContext,
) {
  const res = await request.put(PROFILE_URL, {
    data: {
      sex: 'MALE',
      birthDate: '1986-05-22',
      heightCm: 180,
      timezone: 'UTC',
      reminderHour: 9,
      remindersEnabled: false,
    },
  })
  expect(res.ok()).toBe(true)
}

// Headless Chromium has no real push service, so PushManager.subscribe() would
// reject. Stub only that external transport (and the permission prompt) so the
// genuine subscription JSON still reaches — and is stored by — the real backend.
async function stubPushService(page: Page) {
  await page.addInitScript((endpoint) => {
    const subscription = {
      endpoint,
      toJSON: () => ({
        endpoint,
        keys: { p256dh: 'BSmokeKey', auth: 'SmokeAuth' },
      }),
      unsubscribe: async () => true,
    }
    const proto = (
      window as { PushManager?: { prototype: Record<string, unknown> } }
    ).PushManager?.prototype
    if (proto) {
      proto.subscribe = async () => subscription
      proto.getSubscription = async () => null
    }
    if (window.Notification) {
      window.Notification.requestPermission = async () => 'granted'
    }
  }, DEVICE_ENDPOINT)
}

async function waitForServiceWorker(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.waitForFunction(() => !!navigator.serviceWorker.controller)
}

test('enabling reminders subscribes the device and saves the preferences', async ({
  page,
  goto,
  request,
}) => {
  await seedProfile(request)
  await stubPushService(page)
  await goto('/profile', { waitUntil: 'hydration' })
  await waitForServiceWorker(page)

  await page.getByRole('switch', { name: /reminder/i }).click()

  // The device's subscription is persisted server-side.
  await expect
    .poll(async () => {
      const res = await request.get(SUBSCRIPTIONS_URL)
      return res.ok() ? ((await res.json()) as string[]) : []
    })
    .toContain(DEVICE_ENDPOINT)

  // And the opt-in round-trips on the profile.
  const profile = (await (await request.get(PROFILE_URL)).json()) as {
    remindersEnabled: boolean
    reminderHour: number
  }
  expect(profile.remindersEnabled).toBe(true)
  expect(profile.reminderHour).toBe(9)
})

test.describe('on iOS Safari before installing', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  })

  test('shows the add-to-home-screen hint and subscribes nothing', async ({
    page,
    goto,
    request,
  }) => {
    await seedProfile(request)
    await stubPushService(page)
    await goto('/profile', { waitUntil: 'hydration' })

    await expect(
      page.getByText(/add tucker to your home screen first/i),
    ).toBeVisible()
    await expect(page.getByRole('switch', { name: /reminder/i })).toHaveCount(0)

    const subscriptions = (await (
      await request.get(SUBSCRIPTIONS_URL)
    ).json()) as string[]
    expect(subscriptions).toEqual([])
  })
})
