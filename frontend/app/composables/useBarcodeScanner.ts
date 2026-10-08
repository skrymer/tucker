// Bundled as a same-origin asset rather than left to zxing-wasm's CDN default.
import zxingReaderWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'
import type { Ref } from 'vue'
import type { ReaderOptions } from 'zxing-wasm/reader'

export type ScannerState =
  | 'idle'
  | 'requesting'
  | 'scanning'
  | 'decoded'
  | 'denied'
  | 'unsupported'

type ReadBarcodes = typeof import('zxing-wasm/reader').readBarcodes

// Decode no more than ~8 times a second: a barcode doesn't change frame to
// frame, so polling the full 60fps just burns battery and CPU on the phone.
const DECODE_INTERVAL_MS = 120
// A current frame (HAVE_CURRENT_DATA) is enough to grab pixels from.
const MIN_READY_STATE = 2

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

/**
 * The WASM decoder, lazy-loaded behind the Scan tap — it never touches first
 * paint (ADR 0006). Served from our own origin: left to itself zxing-wasm
 * fetches it from a public CDN at first decode, which puts a third party on the
 * path of a scan in a shop — and silently fails there, where a Check has no
 * manual fallback to offer.
 */
async function loadDecoder(): Promise<ReadBarcodes> {
  const reader = await import('zxing-wasm/reader')
  reader.setZXingModuleOverrides({ locateFile: () => zxingReaderWasmUrl })
  return reader.readBarcodes
}

/**
 * Which dead end a camera that would not open is. A refused permission is the
 * one state the user can recover from in OS settings; everything else (no
 * camera, hardware busy, insecure context) collapses to "can't scan here". What
 * each mount point does with that differs by design: Add-Food falls through to
 * manual entry (ADR 0006), while a Check has no manual path and the tab simply
 * ends (ADR 0022).
 */
function refusalOf(error: unknown): ScannerState {
  const name = error instanceof DOMException ? error.name : ''
  return name === 'NotAllowedError' || name === 'SecurityError'
    ? 'denied'
    : 'unsupported'
}

// One canvas for every scanner the app opens: only one camera runs at a time,
// and a full-resolution frame buffer is several megabytes to allocate afresh
// each time a sheet holding a scanner opens.
let canvas: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null

/** Reads the video's current frame into pixels, on the one shared canvas. */
function grabFrame(video: HTMLVideoElement | null): ImageData | null {
  if (!video || video.readyState < MIN_READY_STATE) return null
  const { videoWidth: w, videoHeight: h } = video
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

function stopTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop())
}

function requestRearCamera() {
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } },
  })
}

async function attachAndPlay(
  video: HTMLVideoElement | null,
  stream: MediaStream | null,
) {
  if (!video) return
  video.srcObject = stream
  // play() can reject if the stream was torn down mid-start; ignore.
  await video.play().catch(() => {})
}

/** The text of the first valid code in [frame], or null. */
async function firstReadable(read: ReadBarcodes, frame: ImageData) {
  const results = await read(frame, READER_OPTIONS)
  return results.find((r) => r.isValid && r.text)?.text ?? null
}

/**
 * The rear camera's stream. Every start is an attempt that a later start or a
 * release supersedes: without that, a `stop()` during the getUserMedia await —
 * leaving the tab, or backgrounding the app while the permission prompt is up —
 * is silently undone when the promise resolves, leaving a live stream nothing
 * can reach. Never leave the light on.
 */
function useCameraStream(videoEl: Ref<HTMLVideoElement | null>) {
  let stream: MediaStream | null = null
  let generation = 0
  const superseded = (attempt: number) => attempt !== generation

  /** Opens the camera for [attempt]: 'ok', the refusal's state, or 'superseded'. */
  async function open(attempt: number) {
    const opened = await requestRearCamera().catch((error: unknown) =>
      superseded(attempt) ? 'superseded' : refusalOf(error),
    )
    if (typeof opened === 'string') return opened
    // Superseded or released while the permission was pending — the stream just
    // opened belongs to nobody, so close it here rather than leak it.
    if (superseded(attempt)) {
      stopTracks(opened)
      return 'superseded'
    }
    stream = opened
    return 'ok'
  }

  /** Attaches the stream once the <video> has mounted, and plays it. */
  async function play() {
    await nextTick()
    await attachAndPlay(videoEl.value, stream)
  }

  function release() {
    generation++
    stopTracks(stream)
    stream = null
    if (videoEl.value) videoEl.value.srcObject = null
  }

  return { begin: () => ++generation, superseded, open, play, release }
}

/**
 * One decode at a time — `tryHarder` over a full-resolution frame can outrun
 * the loop's tick on a phone, and without this the calls queue up, each pinning
 * its own multi-megabyte ImageData. Null while one is in flight or no frame is
 * ready, else the code read (or null for none).
 */
function useFrameDecoder(videoEl: Ref<HTMLVideoElement | null>) {
  let decoding = false
  return async (read: ReadBarcodes) => {
    const frame = decoding ? null : grabFrame(videoEl.value)
    if (!frame) return null
    decoding = true
    try {
      return await firstReadable(read, frame)
    } finally {
      decoding = false
    }
  }
}

/**
 * Decoding the live feed, no more than once per DECODE_INTERVAL_MS. `scan`
 * resolves with the first code read, and rejects when the decoder breaks: its
 * WASM is fetched lazily on the first decode, not on the import, so this is
 * where an unreachable or blocked binary surfaces — and it would otherwise
 * reject 8 times a second behind a live camera that can never read anything.
 * A halted scan settles never.
 */
function useDecodeLoop(videoEl: Ref<HTMLVideoElement | null>) {
  const decodeFrame = useFrameDecoder(videoEl)
  let rafId: number | null = null
  // Bumped by every scan and every halt, so a scan can tell it was halted.
  let current = 0

  function scan(read: ReadBarcodes) {
    const mine = ++current
    let lastDecodeAt = 0
    return new Promise<string>((resolve, reject) => {
      const tick = (now: number) => {
        rafId = requestAnimationFrame(tick)
        if (now - lastDecodeAt < DECODE_INTERVAL_MS) return
        lastDecodeAt = now
        decodeFrame(read).then((text) => {
          if (text && mine === current) resolve(text)
        }, reject)
      }
      rafId = requestAnimationFrame(tick)
    })
  }

  function halt() {
    current++
    if (rafId != null) cancelAnimationFrame(rafId)
    rafId = null
  }
  return { scan, halt }
}

/**
 * Never leave the camera light on. iOS keeps it lit when the PWA is
 * backgrounded or the screen locks unless the tracks are stopped here, so the
 * camera goes on visibility loss and page hide as well as on scope teardown.
 */
function useReleaseWhenHidden(
  state: Ref<ScannerState>,
  interrupted: Ref<boolean>,
  stop: () => void,
  release: () => void,
) {
  function onVisibilityChange() {
    if (document.visibilityState !== 'hidden') return
    // Only an idle scanner was stopped by someone; anything else — open, or a
    // camera refused or missing — is worth asking again about on return.
    const wasStopped = state.value === 'idle'
    stop()
    interrupted.value = !wasStopped
  }
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pagehide', stop)
  onScopeDispose(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('pagehide', stop)
    release()
  })
}

/** The camera and the loop reading it, which are released together. */
function useCamera(videoEl: Ref<HTMLVideoElement | null>) {
  const stream = useCameraStream(videoEl)
  const decoding = useDecodeLoop(videoEl)
  function release() {
    decoding.halt()
    stream.release()
  }
  /** A new start supersedes the loop reading the last one. */
  function begin() {
    decoding.halt()
    return stream.begin()
  }
  return { ...stream, begin, scan: decoding.scan, release }
}

/** What the scanner is showing, as its surfaces read it. */
function useScannerState() {
  const state = ref<ScannerState>('idle')
  const barcode = ref<string | null>(null)
  /** On screen: from the camera request until a decode, a stop or a failure. */
  const open = computed(
    () => state.value === 'requesting' || state.value === 'scanning',
  )
  /**
   * The app went to the background with the scanner not stopped by anyone —
   * running, or refused a camera — which a surface may retry on return.
   */
  const interrupted = ref(false)
  return { state, barcode, open, interrupted }
}

/**
 * Bringing the scanner up to a playing camera and a loaded decoder. Resolves
 * with the decoder, 'broken' when it could not load, or null when the camera
 * would not open or the start was superseded.
 */
function useScanStart(
  state: Ref<ScannerState>,
  camera: ReturnType<typeof useCamera>,
) {
  return async (): Promise<ReadBarcodes | 'broken' | null> => {
    const attempt = camera.begin()
    // No camera API at all (old WebView, some iOS private-browsing modes, or an
    // insecure context) — go straight to manual entry, never request anything.
    if (!navigator.mediaDevices?.getUserMedia) {
      state.value = 'unsupported'
      return null
    }
    // Set before the first await, so the permission-in-flight state is
    // observable and getUserMedia stays inside the user-gesture chain iOS
    // WebKit requires.
    state.value = 'requesting'
    const opened = await camera.open(attempt)
    if (opened !== 'ok') {
      if (opened !== 'superseded') state.value = opened
      return null
    }
    const read = await loadDecoder().catch(() => 'broken' as const)
    if (read === 'broken') return read
    if (camera.superseded(attempt)) return null
    // Enter `scanning` first so the <video> mounts, then attach the stream — the
    // element is rendered only in this state. Showing it before play() also
    // matters on iOS, where play() on a hidden video silently no-ops.
    state.value = 'scanning'
    await camera.play()
    return camera.superseded(attempt) ? null : read
  }
}

export function useBarcodeScanner() {
  const { state, barcode, open, interrupted } = useScannerState()
  const videoEl = ref<HTMLVideoElement | null>(null)
  const camera = useCamera(videoEl)
  const prepare = useScanStart(state, camera)

  function end(next: ScannerState) {
    camera.release()
    state.value = next
  }
  function decoded(text: string) {
    barcode.value = text
    end('decoded')
  }

  async function start() {
    barcode.value = null
    const read = await prepare()
    // A decoder that can't load or can't run is the same dead end as no camera.
    // On a Check there is no manual path to fall back to, so say the scanner is
    // unavailable rather than run a loop that can never read.
    if (read === 'broken') return end('unsupported')
    if (read) camera.scan(read).then(decoded, () => end('unsupported'))
  }

  function stop() {
    camera.release()
    if (state.value !== 'decoded') state.value = 'idle'
  }

  useReleaseWhenHidden(state, interrupted, stop, camera.release)

  return { state, open, interrupted, barcode, videoEl, start, stop }
}
