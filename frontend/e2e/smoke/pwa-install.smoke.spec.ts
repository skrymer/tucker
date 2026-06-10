import { test, expect } from './support/smoke-test'

// F6 slice 1 smoke (issue #80): the PWA foundation + install affordance against
// the real stack. Proves the manifest and service worker are served, the
// precached shell loads with the network cut, and the platform-aware install
// affordance shows (the Chromium button and the iOS instructional path).

// Going offline makes the live /api/* probes fail at the network layer — that is
// the point of the offline test, not a regression, so tolerate exactly that.
test.use({ allowedErrors: [/net::ERR_INTERNET_DISCONNECTED/] })

// Wait until the service worker has installed, activated, and taken control of
// the page, so the precache is populated before we cut the network.
async function waitForServiceWorker(page: import('@playwright/test').Page) {
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.waitForFunction(() => !!navigator.serviceWorker.controller)
}

test('serves and links a complete web app manifest and a service worker', async ({
  page,
  goto,
}) => {
  await goto('/', { waitUntil: 'hydration' })
  const origin = new URL(page.url()).origin

  // The document must link the manifest credentialed (`pwa.useCredentials`) or
  // Chromium never discovers it and Cloudflare Access challenges the fetch
  // (ADR 0015).
  const manifestLink = page.locator('link[rel="manifest"]')
  await expect(manifestLink).toHaveCount(1)
  await expect(manifestLink).toHaveAttribute('href', '/manifest.webmanifest')
  await expect(manifestLink).toHaveAttribute('crossorigin', 'use-credentials')

  const manifest = await page.request.get(`${origin}/manifest.webmanifest`)
  expect(manifest.ok()).toBe(true)
  const body = (await manifest.json()) as {
    name: string
    display: string
    theme_color: string
    icons: Array<{ sizes: string; purpose?: string }>
  }
  expect(body.name).toBe('Tucker')
  expect(body.display).toBe('standalone')
  expect(body.theme_color).toBe('#00c16a')
  // Install criteria need a 512px icon and an Android maskable variant.
  expect(body.icons.some((i) => i.sizes === '512x512')).toBe(true)
  expect(body.icons.some((i) => i.purpose === 'maskable')).toBe(true)

  const sw = await page.request.get(`${origin}/sw.js`)
  expect(sw.ok()).toBe(true)
})

test('loads the precached app shell with the network offline', async ({
  page,
  goto,
  context,
}) => {
  await goto('/', { waitUntil: 'hydration' })
  await waitForServiceWorker(page)

  await context.setOffline(true)
  await page.reload()

  // The shell renders from the precache instead of white-screening: the primary
  // navigation (side-nav on desktop, bottom-nav on phone) is visible.
  await expect(page.locator('nav[aria-label="Primary"]:visible')).toBeVisible()
  await context.setOffline(false)
})

test('shows the install button once the browser offers an install', async ({
  page,
  goto,
}) => {
  await goto('/profile', { waitUntil: 'hydration' })

  // Stand in for Chromium's beforeinstallprompt, which doesn't fire on its own
  // under test; usePwaInstall captures it and reveals the button.
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt') as Event & {
      prompt: () => Promise<void>
      userChoice: Promise<{ outcome: string }>
    }
    event.prompt = () => Promise.resolve()
    event.userChoice = Promise.resolve({ outcome: 'accepted' })
    window.dispatchEvent(event)
  })

  await expect(
    page.getByRole('button', { name: /install tucker/i }),
  ).toBeVisible()
})

test.describe('on iOS Safari', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  })

  test('shows Add to Home Screen instructions instead of a button', async ({
    page,
    goto,
  }) => {
    await goto('/profile', { waitUntil: 'hydration' })

    await expect(page.getByText(/add to home screen/i)).toBeVisible()
    await expect(
      page.getByRole('button', { name: /install tucker/i }),
    ).toHaveCount(0)
  })
})
