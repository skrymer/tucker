import type { Page } from '@playwright/test'
import { writeBarcode } from 'zxing-wasm/writer'

/** Where the stub records acquisitions. Private — read it via [cameraStarts]. */
const CAMERA_STARTS_KEY = '__cameraStarts'

/**
 * Replace `getUserMedia` on [page] before it navigates. [barcodePng] is a raster
 * data-URL of a barcode to hand back as a live camera feed, or `null` to refuse
 * the camera the way a denied permission does.
 *
 * A live camera can't run headless, and Chromium's file-based fake video device
 * needs a y4m/mjpeg fixture we can't generate here. Instead a `<canvas>`
 * continuously paints the barcode and is exposed as a captured stream — so the
 * app's *real* zxing-wasm decoder does the reading and only the hardware is
 * faked. A raster data-URL keeps the capture canvas un-tainted, or the app's
 * `getImageData` (and so the decoder) could not read its frames.
 */
async function stubGetUserMedia(page: Page, barcodePng: string | null) {
  const args = { dataUrl: barcodePng, startsKey: CAMERA_STARTS_KEY }
  await page.addInitScript(({ dataUrl, startsKey }) => {
    if (!navigator.mediaDevices) {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: {},
        configurable: true,
      })
    }

    if (dataUrl === null) {
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        configurable: true,
        value: async () => {
          throw new DOMException('Permission denied', 'NotAllowedError')
        },
      })
      return
    }

    const img = new Image()
    let ready = false
    img.onload = () => {
      ready = true
    }
    img.src = dataUrl
    const canvas = document.createElement('canvas')
    canvas.width = 480
    canvas.height = 480
    const ctx = canvas.getContext('2d')!
    const paint = () => {
      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      if (ready) ctx.drawImage(img, 40, 40, 400, 400)
      requestAnimationFrame(paint)
    }
    paint()
    const counter = window as unknown as Record<string, number>
    counter[startsKey] = 0
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      // A fresh stream per call, as a real camera hands out: the app stops the
      // tracks when it releases the camera, so a shared stream would come back
      // already ended on a second scan.
      value: async () => {
        // Every acquisition is counted, because "the camera was not restarted"
        // is otherwise unobservable from a test: a restart re-decodes the same
        // fake barcode within seconds and issues its own look-up, so request
        // counts and a retrying toBeVisible() both sail straight past it.
        counter[startsKey]++
        return canvas.captureStream(30)
      },
    })
  }, args)
}

/** Feed [page] a synthetic camera showing [barcode]. Call before navigating. */
export async function fakeBarcodeCamera(page: Page, barcode: string) {
  const { image } = await writeBarcode(barcode, { format: 'QRCode', scale: 8 })
  const pngDataUrl = `data:image/png;base64,${Buffer.from(
    await image!.arrayBuffer(),
  ).toString('base64')}`
  await stubGetUserMedia(page, pngDataUrl)
}

/**
 * Deny [page] a camera entirely — `getUserMedia` rejects the way a refused
 * permission does. A Check has no manual path, so this is the end of that tab.
 */
export async function denyCamera(page: Page) {
  await stubGetUserMedia(page, null)
}

/**
 * How many times [page] has acquired the camera since the stub was installed.
 * Compare it across an interaction to assert the camera was *not* restarted —
 * which nothing else can show, because a restart re-decodes the same fake
 * barcode within seconds and issues its own look-up, so request counts rise and
 * any auto-retrying assertion just waits out the viewfinder in between.
 */
export function cameraStarts(page: Page): Promise<number> {
  return page.evaluate(
    (key) => (window as unknown as Record<string, number>)[key] ?? 0,
    CAMERA_STARTS_KEY,
  )
}
