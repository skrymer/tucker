// Derives Tucker's PWA icon set from the avocado brand mark.
//
// The source banner (design/tucker-brand-source.png) is the full brand lockup —
// the avocado holds a flag, flanked by an apple and an orange, over the "tucker"
// wordmark. The avocado alone is the app mark, so this script:
//   1. crops a tight box around the avocado body,
//   2. flood-fills the cream backdrop from the border to transparency and keeps
//      only the largest opaque blob (dropping the apple/flag/orange that the box
//      clips), yielding a clean transparent avocado,
//   3. composites it onto Tucker's brand green for the home-screen icons, fits it
//      into the Android adaptive safe zone for the maskable variant, and renders a
//      white silhouette for the monochrome notification badge.
//
// The box has no ImageMagick/Inkscape, so we lean on sharp. Re-run after changing
// the brand source:  node scripts/generate-pwa-icons.mjs
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = resolve(root, 'design/tucker-brand-source.png')
const OUT = resolve(root, 'public/icons')

// Brand green (#00c16a) — the manifest theme_color and the icon backdrop.
const GREEN = { r: 0, g: 193, b: 106, alpha: 1 }

// Tight box around the avocado body in the 1408x768 source, excluding the apple
// (lower-left), the orange, and the flag the avocado holds (right).
const CROP = { left: 634, top: 104, width: 154, height: 262 }

// A backdrop pixel is the cream banner backdrop: light and near-greyscale. The
// avocado's navy outline (low min) and saturated flesh stop the flood fill, so
// interior highlights (eyes, teeth, seed sheen) are never punched out.
const isCream = (r, g, b) =>
  Math.min(r, g, b) > 196 && Math.max(r, g, b) - Math.min(r, g, b) < 24

// Crop the avocado and return it as a transparent-background raster.
async function cutAvocado() {
  const { data, info } = await sharp(SOURCE)
    .extract(CROP)
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { width: w, height: h, channels: ch } = info
  const at = (x, y) => (y * w + x) * ch

  // Flood-fill the backdrop inward from every edge pixel.
  const isBackdrop = new Uint8Array(w * h)
  const stack = []
  for (let x = 0; x < w; x++) stack.push(x, x + (h - 1) * w)
  for (let y = 0; y < h; y++) stack.push(y * w, w - 1 + y * w)
  while (stack.length) {
    const p = stack.pop()
    if (isBackdrop[p]) continue
    const x = p % w
    const y = (p - x) / w
    const i = at(x, y)
    if (!isCream(data[i], data[i + 1], data[i + 2])) continue
    isBackdrop[p] = 1
    if (x > 0) stack.push(p - 1)
    if (x < w - 1) stack.push(p + 1)
    if (y > 0) stack.push(p - w)
    if (y < h - 1) stack.push(p + w)
  }

  // Keep only the largest opaque connected component (the avocado), dropping any
  // clipped neighbours the box still caught.
  const label = new Int32Array(w * h)
  let next = 0
  let biggest = 0
  let biggestSize = 0
  for (let start = 0; start < w * h; start++) {
    if (isBackdrop[start] || label[start]) continue
    next++
    let size = 0
    const queue = [start]
    label[start] = next
    while (queue.length) {
      const p = queue.pop()
      size++
      const x = p % w
      const y = (p - x) / w
      const neighbours = []
      if (x > 0) neighbours.push(p - 1)
      if (x < w - 1) neighbours.push(p + 1)
      if (y > 0) neighbours.push(p - w)
      if (y < h - 1) neighbours.push(p + w)
      for (const n of neighbours)
        if (!isBackdrop[n] && !label[n]) {
          label[n] = next
          queue.push(n)
        }
    }
    if (size > biggestSize) {
      biggestSize = size
      biggest = next
    }
  }
  for (let p = 0; p < w * h; p++)
    if (isBackdrop[p] || label[p] !== biggest) data[p * ch + 3] = 0

  return sharp(data, { raw: { width: w, height: h, channels: ch } })
    .png()
    .toBuffer()
    .then((png) => sharp(png).trim().toBuffer())
}

// A green square with the avocado centred at the given scale (fraction of side).
// `opaque` drops the alpha channel for iOS, which composites transparency on black.
async function onGreen(size, avocado, scale, opaque = false) {
  const inner = await sharp(avocado)
    .resize({
      width: Math.round(size * scale),
      height: Math.round(size * scale),
      fit: 'inside',
    })
    .sharpen()
    .toBuffer()
  let img = sharp({
    create: { width: size, height: size, channels: 4, background: GREEN },
  }).composite([{ input: inner, gravity: 'center' }])
  if (opaque) img = img.flatten({ background: GREEN }).removeAlpha()
  return img.png().toBuffer()
}

// A white avocado silhouette on transparency for the Android notification tray.
async function badge(size, avocado) {
  // Fit the avocado into the badge, then recolour it white by keeping only its
  // alpha shape over a solid-white field.
  const fitted = await sharp(avocado)
    .resize({
      width: Math.round(size * 0.92),
      height: Math.round(size * 0.92),
      fit: 'inside',
    })
    .toBuffer()
  const { width, height } = await sharp(fitted).metadata()
  const alpha = await sharp(fitted)
    .ensureAlpha()
    .extractChannel(3)
    .raw()
    .toBuffer()
  const inner = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .joinChannel(alpha, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer()
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: inner, gravity: 'center' }])
    .png()
    .toBuffer()
}

async function main() {
  const avocado = await cutAvocado()
  const write = (name, buf) =>
    buf.then((b) => sharp(b).toFile(resolve(OUT, name)))

  await Promise.all([
    // Home-screen / standalone-window icons (purpose "any"): avocado on green.
    write('pwa-192x192.png', onGreen(192, avocado, 0.72)),
    write('pwa-512x512.png', onGreen(512, avocado, 0.72)),
    // Maskable (Android adaptive): avocado shrunk into the ~80% safe circle.
    write('maskable-192x192.png', onGreen(192, avocado, 0.56)),
    write('maskable-512x512.png', onGreen(512, avocado, 0.56)),
    // iOS home screen (no masking, no transparency) — green to the corners.
    write('apple-touch-icon-180x180.png', onGreen(180, avocado, 0.74, true)),
    // Android notification tray: monochrome white silhouette.
    write('badge-72x72.png', badge(72, avocado)),
  ])
  console.log('PWA icons written to public/icons/')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
