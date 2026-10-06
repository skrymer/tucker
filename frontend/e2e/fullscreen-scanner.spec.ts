import type { Locator, Page } from '@playwright/test'
import { expect, test } from './support/test'
import { blankCamera, cameraLightOn } from './support/fake-camera'

// On a phone the barcode scanner fills the screen: a full-viewport Dialog
// everywhere, plus true fullscreen where the browser has it and a tap asked for
// it (ADR 0006). Desktop keeps its inline viewfinder, so this runs on the phone.

test.skip(({ isMobile }) => !isMobile, 'desktop keeps the inline viewfinder')

/** Whether the page is in true (element) fullscreen. */
function inTrueFullscreen(page: Page) {
  return page.evaluate(() => document.fullscreenElement !== null)
}

/** [element]'s box lies wholly inside the viewport. */
async function expectWithinViewport(page: Page, element: Locator) {
  const box = (await element.boundingBox())!
  const viewport = page.viewportSize()!
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
}

test('Check opens a scanner filling the screen, and Stop gives the tab back', async ({
  page,
  goto,
}) => {
  await blankCamera(page)

  await goto('/check', { waitUntil: 'hydration' })

  const scanner = page.getByRole('dialog', { name: 'Barcode scanner' })
  await expect(scanner.getByText('Point the camera at a barcode')).toBeVisible()
  // Polled: the Dialog scales in, so an early box is mid-animation.
  await expect
    .poll(() => scanner.boundingBox())
    .toEqual({ x: 0, y: 0, ...page.viewportSize()! })
  const stop = scanner.getByRole('button', { name: 'Stop' })
  await expectWithinViewport(page, stop)
  // Arriving on the tab is no gesture, so it gets the Dialog alone.
  expect(await inTrueFullscreen(page)).toBe(false)

  await stop.click()

  await expect(scanner).toBeHidden()
  expect(await cameraLightOn(page)).toBe(false)
  await expect(page.getByText('Camera paused')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start camera' })).toBeVisible()
  await expect(page.getByRole('navigation').first()).toBeVisible()
})

test('a tap goes truly fullscreen, and leaving it closes the scanner', async ({
  page,
  goto,
}) => {
  await blankCamera(page)
  await goto('/check', { waitUntil: 'hydration' })
  const scanner = page.getByRole('dialog', { name: 'Barcode scanner' })
  await scanner.getByRole('button', { name: 'Stop' }).click()
  await expect(scanner).toBeHidden()

  await page.getByRole('button', { name: 'Start camera' }).click()

  await expect(scanner.getByText('Point the camera at a barcode')).toBeVisible()
  await expect.poll(() => inTrueFullscreen(page)).toBe(true)

  // What Android's back gesture does: fullscreen ends without the app asking.
  await page.evaluate(() => document.exitFullscreen())

  await expect(scanner).toBeHidden()
  await expect.poll(() => cameraLightOn(page)).toBe(false)
  await expect(page.getByRole('button', { name: 'Start camera' })).toBeVisible()
})

test('Add food scans over the sheet, and Stop returns to it out of fullscreen', async ({
  page,
  goto,
}) => {
  await blankCamera(page)
  await goto('/foods', { waitUntil: 'hydration' })
  await page.getByRole('button', { name: 'Add food' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add food' })
  await sheet.getByLabel(/^name$/i).fill('Oat milk')

  await sheet.getByRole('button', { name: 'Scan barcode' }).click()

  const scanner = page.getByRole('dialog', { name: 'Barcode scanner' })
  await expect(scanner.getByText('Point the camera at a barcode')).toBeVisible()
  await expect
    .poll(() => scanner.boundingBox())
    .toEqual({ x: 0, y: 0, ...page.viewportSize()! })
  await expect.poll(() => inTrueFullscreen(page)).toBe(true)

  await scanner.getByRole('button', { name: 'Stop' }).click()

  await expect(scanner).toBeHidden()
  await expect.poll(() => inTrueFullscreen(page)).toBe(false)
  expect(await cameraLightOn(page)).toBe(false)
  await expect(sheet.getByLabel(/^name$/i)).toHaveValue('Oat milk')
  await expect(sheet.getByLabel(/barcode/i)).toHaveValue('')
})

test('a refused fullscreen request leaves the scanner to the Dialog, quietly', async ({
  page,
  goto,
}) => {
  // A browser may refuse fullscreen (a policy, a missed gesture window). The
  // auto console guard fails the test on the rejection reaching the page.
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () =>
      Promise.reject(new TypeError('Permissions check failed'))
  })
  await blankCamera(page)
  await goto('/check', { waitUntil: 'hydration' })
  const scanner = page.getByRole('dialog', { name: 'Barcode scanner' })
  await scanner.getByRole('button', { name: 'Stop' }).click()
  await expect(scanner).toBeHidden()

  await page.getByRole('button', { name: 'Start camera' }).click()

  await expect(scanner.getByText('Point the camera at a barcode')).toBeVisible()
  expect(await inTrueFullscreen(page)).toBe(false)
})
