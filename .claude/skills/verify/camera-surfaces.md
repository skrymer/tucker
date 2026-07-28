# Walking through a camera-gated surface

Two surfaces need a camera before they show anything worth verifying: the **Check** tab
(`/check`) and the **barcode scan** path in Add-Food. On the Check tab a denied camera
*ends the screen* by design (ADR 0022 — no manual fallback), so without a fake camera
there is nothing to walk through at all.

Only the **hardware** is faked. The app's real `zxing-wasm` decoder reads the frames, so
the decode, the lookup, and every figure on screen are the real code paths.

## The recipe

### 1. Seed a Food carrying the barcode

Resolve catalog-first so the walk-through never depends on Open Food Facts being up:

```bash
curl -s -X POST http://localhost:8080/api/foods -H 'Content-Type: application/json' \
  -d '{"name":"Hazelnut spread","barcode":"3017620422003",
       "proteinPer100g":6.3,"carbsPer100g":57.5,"fatPer100g":30.9}'
```

Pick macros that exercise the branch you care about — the values above sit well below
Pace, so the "balance it elsewhere" copy renders.

### 2. Write a QR PNG into `frontend/public/`

**Not** a base64 data-URL: the harness renders a bare `data:image/png;base64,…` string
as an image instead of passing the text through, so you can't get it into the injected
script that way. Serve it from the dev server instead.

```bash
cd frontend && cat > .qr-scratch.mjs <<'EOF'
import { writeBarcode } from 'zxing-wasm/writer'
import { writeFileSync } from 'node:fs'
const { image } = await writeBarcode('3017620422003', { format: 'QRCode', scale: 8 })
writeFileSync('public/__walkthrough-qr.png', Buffer.from(await image.arrayBuffer()))
EOF
node .qr-scratch.mjs && rm -f .qr-scratch.mjs
```

The script must live **inside `frontend/`** — ESM resolves `zxing-wasm` from the
file's own location, so a copy in the scratchpad fails with `ERR_MODULE_NOT_FOUND`.

### 3. Load a non-camera page first, then inject the stub

`onMounted` starts the camera, so the stub has to exist *before* the page mounts.
Navigate to `/` (Today), then `javascript_tool`:

```js
const img = new Image()
let ready = false
img.onload = () => { ready = true }
img.src = '/__walkthrough-qr.png'
const canvas = document.createElement('canvas')
canvas.width = 480; canvas.height = 480
const ctx = canvas.getContext('2d')
const paint = () => {
  ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  if (ready) ctx.drawImage(img, 40, 40, 400, 400)
  requestAnimationFrame(paint)
}
paint()
Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
  configurable: true,
  // A fresh stream per call, as a real camera hands out — the app stops the tracks
  // when it releases the camera, so a shared stream comes back already ended.
  value: async () => canvas.captureStream(30),
})
```

### 4. Reach the surface by **SPA navigation**

Click the nav link (`read_page filter:interactive` → `computer left_click`). A URL-bar
`navigate` reloads the document and throws the stub away. The decode takes a few frames
— screenshot again if the first one still shows the viewfinder.

### 5. Clean up

```bash
rm -f frontend/public/__walkthrough-qr.png
```

Then `git status --short` to prove it's gone. **Never commit the scratch PNG.**

## Gotchas

- **A background Chrome window pauses `requestAnimationFrame`** — and
  `useBarcodeScanner` drives its decode tick with rAF, so the video shows frames
  (`readyState 4`) and *nothing ever decodes*. You'll sit at "Point the camera at a
  barcode" forever with no error. Two things are needed when the tab reports
  `document.visibilityState === 'hidden'`:
  - paint the canvas with `setInterval`, not rAF (rAF is throttled to a standstill), and
  - shim the scheduler so the app's own decode loop runs:
    ```js
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16)
    window.cancelAnimationFrame = (id) => clearTimeout(id)
    ```
  Only the scheduling primitive is faked — the decode, the lookup and the render stay
  the app's own code. Foregrounding the Chrome window avoids the shim entirely; prefer
  that when you can, and say which you did in the verdict.
- **The stub must be re-injected after any camera release.** The composable drops the
  camera on visibility loss, so a tab that was ever hidden holds a dead stream. SPA-nav
  away and back to force `onMounted` → `getUserMedia` against your current canvas.
- **Swap barcodes without a reload** by exposing a setter alongside the stub —
  `window.__wtSwap = (src) => { ready = false; img.src = src }` — then hit "Scan
  another". It's the fastest way to compare two failure messages side by side.
- **Terminate the inject snippet's final expression with a leading `;`** —
  `;({ ok: 1 })`. Without it ASI parses the previous line as a call and it throws.
- **Today is `/`, not `/today`** (`app/pages/index.vue`). `/today` is a bare redirect
  to it (`app/pages/today.vue`), kept only for reminders sent before
  [#178](https://github.com/skrymer/tucker/issues/178) — never link to it.
- The Check tab **unmounts its analysis between scans**, so "Scan another" re-decodes
  the same fake barcode — which makes it a free way to verify reset-on-new-product
  behaviour.
- A stale `.nuxt` build can serve old markup; `rm -rf frontend/.nuxt/test` only affects
  the Playwright build, not `pnpm dev`. If `pnpm dev` looks stale, restart it.
- Reuse the same tab for both viewports — the stub lives in the page context and
  survives a resize, but not a reload.
