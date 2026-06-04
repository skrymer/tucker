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
  let readBarcodes: typeof import('zxing-wasm/reader').readBarcodes | null =
    null

  function releaseCamera() {
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
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, w, h)
    return ctx.getImageData(0, 0, w, h)
  }

  // Retail barcodes: EAN/UPC plus the QR/DataMatrix codes some products carry.
  // Narrowing the format set keeps the per-frame decode cheap enough to afford
  // tryHarder, which is what actually reads a code held at an angle or wrapped
  // around a curved package (a flat, head-on label decodes either way).
  const READER_OPTIONS = {
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
  } as const

  async function decodeFrame() {
    if (!readBarcodes) return
    const frame = grabFrame()
    if (!frame) return
    const results = await readBarcodes(frame, READER_OPTIONS)
    if (state.value !== 'scanning') return
    const hit = results.find((r) => r.isValid && r.text)
    if (hit) {
      barcode.value = hit.text
      state.value = 'decoded'
      releaseCamera()
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
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      })
    } catch (err) {
      // A refused permission is the one state the user can recover from in OS
      // settings; everything else (no camera, hardware busy, insecure context)
      // collapses to "can't scan here" — both fall through to manual entry.
      const name = err instanceof DOMException ? err.name : ''
      state.value =
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'denied'
          : 'unsupported'
      return
    }
    // Lazy-load the WASM decoder only now, behind the Scan tap — it never
    // touches first paint (ADR 0006).
    ;({ readBarcodes } = await import('zxing-wasm/reader'))
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
