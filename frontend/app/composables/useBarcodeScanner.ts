// Bundled as a same-origin asset rather than left to zxing-wasm's CDN default.
import zxingReaderWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'
import type { ReaderOptions } from 'zxing-wasm/reader'

export type ScannerState =
  | 'idle'
  | 'requesting'
  | 'scanning'
  | 'decoded'
  | 'denied'
  | 'unsupported'

export function useBarcodeScanner() {
  const state = ref<ScannerState>('idle')
  const barcode = ref<string | null>(null)
  const videoEl = ref<HTMLVideoElement | null>(null)

  // Decode no more than ~8 times a second: a barcode doesn't change frame to
  // frame, so polling the full 60fps just burns battery and CPU on the phone.
  const DECODE_INTERVAL_MS = 120
  // A current frame (HAVE_CURRENT_DATA) is enough to grab pixels from.
  const MIN_READY_STATE = 2

  let stream: MediaStream | null = null
  let rafId: number | null = null
  let lastDecodeAt = 0
  let canvas: HTMLCanvasElement | null = null
  let ctx: CanvasRenderingContext2D | null = null
  // One decode in flight at a time. `tryHarder` over a full-resolution frame can
  // outrun the 120ms tick on a phone, and without this the calls queue up, each
  // pinning its own multi-megabyte ImageData.
  let decoding = false
  // Bumped by every start and every release, so an in-flight start can tell it
  // has been superseded once its awaits resolve.
  let startGeneration = 0
  let readBarcodes: typeof import('zxing-wasm/reader').readBarcodes | null =
    null

  function releaseCamera() {
    // Invalidate any start still waiting on getUserMedia or the WASM import.
    startGeneration++
    if (rafId != null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    stream?.getTracks().forEach((track) => track.stop())
    stream = null
    if (videoEl.value) videoEl.value.srcObject = null
  }

  function grabFrame(): ImageData | null {
    const video = videoEl.value
    if (!video || video.readyState < MIN_READY_STATE) return null
    const w = video.videoWidth
    const h = video.videoHeight
    if (!w || !h) return null
    canvas ??= document.createElement('canvas')
    // Resizing reallocates the backing store, so only do it when the feed's
    // dimensions actually change — not on all eight frames a second.
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    // getImageData is a GPU→CPU readback; `willReadFrequently` keeps the canvas
    // on a software path built for exactly that, which is all this one is for.
    ctx ??= canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, w, h)
    return ctx.getImageData(0, 0, w, h)
  }

  // Retail barcodes: EAN/UPC plus the QR/DataMatrix codes some products carry.
  // Narrowing the format set keeps the per-frame decode cheap enough to afford
  // tryHarder, which is what actually reads a code held at an angle or wrapped
  // around a curved package (a flat, head-on label decodes either way).
  // Typed against ReaderOptions rather than `as const`: the readonly tuple an
  // `as const` produced wasn't assignable to the mutable `formats` the decoder
  // takes, and — more usefully — this checks each name against zxing's format
  // union, so a typo is a compile error instead of a format that silently
  // never decodes.
  const READER_OPTIONS: ReaderOptions = {
    formats: [
      'EAN-13',
      'EAN-8',
      'UPC-A',
      'UPC-E',
      'Code128',
      'Code39',
      'ITF',
      'QRCode',
      'DataMatrix',
    ],
    tryHarder: true,
  }

  async function decodeFrame() {
    if (!readBarcodes || decoding) return
    const frame = grabFrame()
    if (!frame) return
    decoding = true
    try {
      // The decoder's WASM is fetched lazily on this first call, not on the
      // import — so this is where an unreachable or blocked binary surfaces, and
      // it would otherwise reject 8 times a second behind a live camera that can
      // never read anything. On a Check there is no manual path to fall back to,
      // so say the scanner is unavailable rather than hang on a working-looking
      // viewfinder.
      const results = await readBarcodes(frame, READER_OPTIONS)
      if (state.value !== 'scanning') return
      const hit = results.find((r) => r.isValid && r.text)
      if (hit) {
        barcode.value = hit.text
        state.value = 'decoded'
        releaseCamera()
      }
    } catch {
      releaseCamera()
      state.value = 'unsupported'
    } finally {
      decoding = false
    }
  }

  function loop(now: number) {
    if (state.value !== 'scanning') return
    if (now - lastDecodeAt >= DECODE_INTERVAL_MS) {
      lastDecodeAt = now
      void decodeFrame()
    }
    rafId = requestAnimationFrame(loop)
  }

  async function start() {
    // A start supersedes any earlier one, and releasing the camera invalidates
    // whichever is in flight. Without this, a `stop()` during the getUserMedia
    // await — leaving the tab, or backgrounding the app while the permission
    // prompt is up — is silently undone when the promise resolves, leaving a
    // live stream and an rAF loop nothing can reach. Never leave the light on.
    const generation = ++startGeneration
    // `requesting` is set synchronously, before the first await, so the
    // permission-in-flight state is observable and so getUserMedia stays inside
    // the user-gesture chain iOS WebKit requires.
    barcode.value = null
    // No camera API at all (old WebView, some iOS private-browsing modes, or an
    // insecure context) — go straight to manual entry, never request anything.
    if (!navigator.mediaDevices?.getUserMedia) {
      state.value = 'unsupported'
      return
    }
    state.value = 'requesting'
    let opened: MediaStream
    try {
      opened = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      })
    } catch (err) {
      // A refused permission is the one state the user can recover from in OS
      // settings; everything else (no camera, hardware busy, insecure context)
      // collapses to "can't scan here". What each mount point does with that
      // differs by design: Add-Food falls through to manual entry (ADR 0006),
      // while a Check has no manual path and the tab simply ends (ADR 0022).
      const name = err instanceof DOMException ? err.name : ''
      if (generation !== startGeneration) return
      state.value =
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'denied'
          : 'unsupported'
      return
    }
    // Superseded or released while the permission was pending — the stream we
    // just opened belongs to nobody, so close it here rather than leak it.
    if (generation !== startGeneration) {
      opened.getTracks().forEach((track) => track.stop())
      return
    }
    stream = opened
    // Lazy-load the WASM decoder only now, behind the Scan tap — it never
    // touches first paint (ADR 0006). A decoder that can't load is the same
    // dead end as no camera: say so rather than run a loop that can never read.
    try {
      const reader = await import('zxing-wasm/reader')
      // Serve the 1 MB decoder from our own origin. Left to itself zxing-wasm
      // fetches it from a public CDN at first decode, which puts a third party
      // on the path of a scan in a shop — and silently fails there, where a
      // Check has no manual fallback to offer.
      reader.setZXingModuleOverrides({ locateFile: () => zxingReaderWasmUrl })
      readBarcodes = reader.readBarcodes
    } catch {
      releaseCamera()
      state.value = 'unsupported'
      return
    }
    if (generation !== startGeneration) return
    // Enter `scanning` first so the <video> mounts, then attach the stream — the
    // element is rendered only in this state. Showing it before play() also
    // matters on iOS, where play() on a hidden video silently no-ops.
    state.value = 'scanning'
    await nextTick()
    const video = videoEl.value
    if (video) {
      video.srcObject = stream
      try {
        await video.play()
      } catch {
        // play() can reject if the stream was torn down mid-start; ignore.
      }
    }
    lastDecodeAt = 0
    rafId = requestAnimationFrame(loop)
  }

  function stop() {
    releaseCamera()
    if (state.value !== 'decoded') state.value = 'idle'
  }

  // Never leave the camera light on. iOS keeps it lit when the PWA is
  // backgrounded or the screen locks unless we stop the tracks ourselves, so
  // release on visibility loss and page hide as well as on scope teardown.
  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') stop()
  }
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pagehide', stop)
  onScopeDispose(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('pagehide', stop)
    releaseCamera()
  })

  return { state, barcode, videoEl, start, stop }
}
