import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { readBarcodes, setZXingModuleOverrides } from 'zxing-wasm/reader'
import { resetPageStubs, setVisibility } from '~~/test/page-visibility-helpers'
import { useBarcodeScanner } from './useBarcodeScanner'

// The camera and the WASM decoder are the two things a unit test can't run for
// real (ADR 0006: the live lifecycle is covered by a real-stack smoke). Here we
// mock both and assert the exposed state machine + decoded barcode — never the
// mock internals.
vi.mock('zxing-wasm/reader', () => ({
  readBarcodes: vi.fn(async () => []),
  // The composable points the decoder at a same-origin .wasm before using it.
  setZXingModuleOverrides: vi.fn(),
}))

const readBarcodesMock = vi.mocked(readBarcodes)

/** A fake MediaStream whose tracks record their own stop() calls. */
function fakeStream() {
  const track = { stop: vi.fn(), kind: 'video' }
  return {
    stream: { getTracks: () => [track] } as unknown as MediaStream,
    track,
  }
}

let getUserMedia: ReturnType<typeof vi.fn>

function mockMediaDevices(impl?: typeof getUserMedia) {
  getUserMedia = impl ?? vi.fn()
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
    writable: true,
  })
}

// A harness that surfaces the composable's reactive state into the DOM and
// drives it through buttons, so the tests read state the way any consumer
// would — through rendered output and user interaction.
const Harness = defineComponent({
  setup() {
    return useBarcodeScanner()
  },
  template: `
    <div>
      <span data-testid="state">{{ state }}</span>
      <span data-testid="barcode">{{ barcode ?? '' }}</span>
      <span data-testid="open">{{ open }}</span>
      <span data-testid="interrupted">{{ interrupted }}</span>
      <video ref="videoEl"></video>
      <button @click="start">scan</button>
      <button @click="stop">stop</button>
    </div>
  `,
})

/** Let the decode loop grab a frame: a <video> with one, and a 2D context. */
function primeVideoFrame() {
  const video = screen
    .getByTestId('state')
    .parentElement!.querySelector('video')!
  Object.defineProperty(video, 'readyState', { value: 4, configurable: true })
  Object.defineProperty(video, 'videoWidth', { value: 640, configurable: true })
  Object.defineProperty(video, 'videoHeight', {
    value: 480,
    configurable: true,
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
  } as unknown as CanvasRenderingContext2D)
}

function stateText() {
  return screen.getByTestId('state').textContent
}

async function tapScan() {
  await userEvent.setup().click(screen.getByRole('button', { name: 'scan' }))
}

beforeEach(() => {
  readBarcodesMock.mockReset()
  readBarcodesMock.mockResolvedValue([])
  mockMediaDevices()
  // happy-dom's <video> validates srcObject is a real MediaStream and has no
  // play(); relax both so the fake stream attaches and playback no-ops.
  Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
    configurable: true,
    writable: true,
    value: null,
  })
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    writable: true,
    value: vi.fn(async () => {}),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  resetPageStubs()
})

describe('useBarcodeScanner', () => {
  it('moves through requesting to scanning when the camera is granted', async () => {
    let grant: (s: MediaStream) => void = () => {}
    getUserMedia.mockReturnValue(
      new Promise<MediaStream>((resolve) => {
        grant = resolve
      }),
    )

    await renderSuspended(Harness)

    await tapScan()
    await nextTick()
    // The camera permission prompt is in flight.
    expect(stateText()).toBe('requesting')

    grant(fakeStream().stream)
    await vi.waitFor(() => expect(stateText()).toBe('scanning'))
  })

  it('is open from the camera request until it stops', async () => {
    let grant: (s: MediaStream) => void = () => {}
    getUserMedia.mockReturnValue(
      new Promise<MediaStream>((resolve) => {
        grant = resolve
      }),
    )
    await renderSuspended(Harness)
    expect(screen.getByTestId('open')).toHaveTextContent('false')

    await tapScan()
    await nextTick()
    expect(screen.getByTestId('open')).toHaveTextContent('true')
    grant(fakeStream().stream)
    await vi.waitFor(() => expect(stateText()).toBe('scanning'))
    expect(screen.getByTestId('open')).toHaveTextContent('true')

    await userEvent.setup().click(screen.getByRole('button', { name: 'stop' }))
    expect(screen.getByTestId('open')).toHaveTextContent('false')
  })

  it('exposes the decoded barcode and enters decoded when one is read', async () => {
    getUserMedia.mockResolvedValue(fakeStream().stream)
    readBarcodesMock.mockResolvedValue([
      { isValid: true, text: '5701234567890' },
    ] as unknown as Awaited<ReturnType<typeof readBarcodes>>)

    await renderSuspended(Harness)

    // A live frame: the decode loop only grabs once the video has a frame and
    // a 2D context. Neither exists under happy-dom, so we provide them.
    const video = screen
      .getByTestId('state')
      .parentElement!.querySelector('video')!
    Object.defineProperty(video, 'readyState', { value: 4, configurable: true })
    Object.defineProperty(video, 'videoWidth', {
      value: 640,
      configurable: true,
    })
    Object.defineProperty(video, 'videoHeight', {
      value: 480,
      configurable: true,
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
    } as unknown as CanvasRenderingContext2D)

    await tapScan()

    await vi.waitFor(() => expect(stateText()).toBe('decoded'))
    expect(screen.getByTestId('barcode').textContent).toBe('5701234567890')
  })

  it('drops a decoded barcode as soon as the next scan is asked for', async () => {
    getUserMedia.mockResolvedValueOnce(fakeStream().stream)
    readBarcodesMock.mockResolvedValue([
      { isValid: true, text: '5701234567890' },
    ] as unknown as Awaited<ReturnType<typeof readBarcodes>>)
    await renderSuspended(Harness)
    const video = screen
      .getByTestId('state')
      .parentElement!.querySelector('video')!
    Object.defineProperty(video, 'readyState', { value: 4, configurable: true })
    Object.defineProperty(video, 'videoWidth', {
      value: 640,
      configurable: true,
    })
    Object.defineProperty(video, 'videoHeight', {
      value: 480,
      configurable: true,
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
    } as unknown as CanvasRenderingContext2D)
    await tapScan()
    await vi.waitFor(() => expect(stateText()).toBe('decoded'))

    // The next camera request never answers: what shows is what start() did
    // before its first await, which is what a surface keyed on `decoded` and
    // the barcode reads the moment Scan again is tapped.
    getUserMedia.mockReturnValueOnce(new Promise(() => {}))
    await tapScan()

    expect(stateText()).toBe('requesting')
    expect(screen.getByTestId('barcode').textContent).toBe('')
  })

  it('releases a camera granted after the scanner was stopped', async () => {
    let grant: (s: MediaStream) => void = () => {}
    getUserMedia.mockReturnValue(new Promise((resolve) => (grant = resolve)))
    const { stream, track } = fakeStream()
    await renderSuspended(Harness)
    await tapScan()
    await userEvent.setup().click(screen.getByRole('button', { name: 'stop' }))

    grant(stream)

    await vi.waitFor(() => expect(track.stop).toHaveBeenCalled())
    expect(stateText()).toBe('idle')
  })

  it('leaves the scan that replaced one still waiting on its prompt alone', async () => {
    let grantFirst: (s: MediaStream) => void = () => {}
    getUserMedia.mockReturnValueOnce(
      new Promise((resolve) => (grantFirst = resolve)),
    )
    const first = fakeStream()
    const second = fakeStream()
    await renderSuspended(Harness)
    primeVideoFrame()
    await tapScan()
    await userEvent.setup().click(screen.getByRole('button', { name: 'stop' }))
    getUserMedia.mockResolvedValueOnce(second.stream)
    await tapScan()
    await vi.waitFor(() => expect(stateText()).toBe('scanning'))

    grantFirst(first.stream)

    await vi.waitFor(() => expect(first.track.stop).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(stateText()).toBe('scanning')
    expect(second.track.stop).not.toHaveBeenCalled()
  })

  it('drops a code decoded after the scanner was stopped', async () => {
    getUserMedia.mockResolvedValue(fakeStream().stream)
    let decode: (r: unknown) => void = () => {}
    readBarcodesMock.mockReturnValueOnce(
      new Promise<unknown>((resolve) => (decode = resolve)) as ReturnType<
        typeof readBarcodes
      >,
    )
    await renderSuspended(Harness)
    primeVideoFrame()
    await tapScan()
    await vi.waitFor(() => expect(readBarcodesMock).toHaveBeenCalled())

    await userEvent.setup().click(screen.getByRole('button', { name: 'stop' }))
    decode([{ isValid: true, text: '5701234567890' }])
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(stateText()).toBe('idle')
    expect(screen.getByTestId('barcode').textContent).toBe('')
  })

  it('ignores a code from before a stop once scanning again', async () => {
    getUserMedia.mockResolvedValue(fakeStream().stream)
    let decode: (r: unknown) => void = () => {}
    readBarcodesMock.mockReturnValueOnce(
      new Promise<unknown>((resolve) => (decode = resolve)) as ReturnType<
        typeof readBarcodes
      >,
    )
    await renderSuspended(Harness)
    primeVideoFrame()
    await tapScan()
    await vi.waitFor(() => expect(readBarcodesMock).toHaveBeenCalled())
    await userEvent.setup().click(screen.getByRole('button', { name: 'stop' }))
    await tapScan()
    await vi.waitFor(() => expect(stateText()).toBe('scanning'))

    decode([{ isValid: true, text: 'OLD' }])
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(stateText()).toBe('scanning')
    expect(screen.getByTestId('barcode').textContent).toBe('')
  })

  it('decodes no more than once while the frames come faster than its tick', async () => {
    getUserMedia.mockResolvedValue(fakeStream().stream)
    const frames: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb)
      return frames.length
    })
    await renderSuspended(Harness)
    primeVideoFrame()
    await tapScan()
    await vi.waitFor(() => expect(stateText()).toBe('scanning'))

    // Eight frames 16 ms apart: 112 ms, inside one 120 ms tick.
    for (let at = 1000; at <= 1112; at += 16) {
      frames.shift()?.(at)
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    expect(readBarcodesMock).toHaveBeenCalledOnce()
  })

  it('releases the camera when the surface holding it goes away', async () => {
    const { stream, track } = fakeStream()
    getUserMedia.mockResolvedValue(stream)
    const { unmount } = await renderSuspended(Harness)
    await tapScan()
    await vi.waitFor(() => expect(stateText()).toBe('scanning'))

    unmount()

    expect(track.stop).toHaveBeenCalled()
  })

  it('ends unsupported, never showing the camera, when its decoder cannot load', async () => {
    const { stream, track } = fakeStream()
    getUserMedia.mockResolvedValue(stream)
    vi.mocked(setZXingModuleOverrides).mockImplementationOnce(() => {
      throw new Error('could not load the decoder')
    })
    await renderSuspended(Harness)

    await tapScan()

    await vi.waitFor(() => expect(stateText()).toBe('unsupported'))
    expect(track.stop).toHaveBeenCalled()
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled()
  })

  it('releases the camera once a code is read', async () => {
    const { stream, track } = fakeStream()
    getUserMedia.mockResolvedValue(stream)
    readBarcodesMock.mockResolvedValue([
      { isValid: true, text: '5701234567890' },
    ] as unknown as Awaited<ReturnType<typeof readBarcodes>>)
    await renderSuspended(Harness)
    primeVideoFrame()

    await tapScan()

    await vi.waitFor(() => expect(stateText()).toBe('decoded'))
    expect(track.stop).toHaveBeenCalled()
  })

  it('reads nothing once stopped while its decoder was loading', async () => {
    getUserMedia.mockResolvedValue(fakeStream().stream)
    readBarcodesMock.mockResolvedValue([
      { isValid: true, text: '5701234567890' },
    ] as unknown as Awaited<ReturnType<typeof readBarcodes>>)
    await renderSuspended(Harness)
    const video = screen
      .getByTestId('state')
      .parentElement!.querySelector('video')!
    Object.defineProperty(video, 'readyState', { value: 4, configurable: true })
    Object.defineProperty(video, 'videoWidth', {
      value: 640,
      configurable: true,
    })
    Object.defineProperty(video, 'videoHeight', {
      value: 480,
      configurable: true,
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
    } as unknown as CanvasRenderingContext2D)
    // The app goes to the background while the decoder is still loading,
    // which stops the scanner.
    vi.mocked(setZXingModuleOverrides).mockImplementationOnce(() =>
      setVisibility('hidden'),
    )

    await tapScan()
    // Long enough for several decode ticks to have run, were any running.
    await new Promise((resolve) => setTimeout(resolve, 400))

    expect(stateText()).toBe('idle')
    expect(screen.getByTestId('barcode').textContent).toBe('')
  })

  it('reads nothing once stopped after being started again mid-scan', async () => {
    getUserMedia.mockResolvedValue(fakeStream().stream)
    await renderSuspended(Harness)
    primeVideoFrame()
    await tapScan()
    await vi.waitFor(() => expect(stateText()).toBe('scanning'))
    await tapScan()
    await vi.waitFor(() => expect(stateText()).toBe('scanning'))

    await userEvent.setup().click(screen.getByRole('button', { name: 'stop' }))
    const readsAtStop = readBarcodesMock.mock.calls.length
    // Long enough for several decode ticks to have run, were any running.
    await new Promise((resolve) => setTimeout(resolve, 400))

    expect(stateText()).toBe('idle')
    expect(readBarcodesMock.mock.calls.length).toBe(readsAtStop)
  })

  it('gives up when the decoder itself cannot run', async () => {
    // The decoder's WASM loads on the first decode, not on the import, so an
    // unreachable binary surfaces here. Without this the camera stays live and
    // the loop retries forever — a viewfinder that can never read anything, on
    // a surface (a Check) that has no manual path to offer instead.
    getUserMedia.mockResolvedValue(fakeStream().stream)
    readBarcodesMock.mockRejectedValue(new Error('failed to load wasm'))

    await renderSuspended(Harness)
    const video = screen
      .getByTestId('state')
      .parentElement!.querySelector('video')!
    Object.defineProperty(video, 'readyState', { value: 4, configurable: true })
    Object.defineProperty(video, 'videoWidth', {
      value: 640,
      configurable: true,
    })
    Object.defineProperty(video, 'videoHeight', {
      value: 480,
      configurable: true,
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
    } as unknown as CanvasRenderingContext2D)

    await tapScan()

    await vi.waitFor(() => expect(stateText()).toBe('unsupported'))
  })

  it('enters denied when the camera permission is refused', async () => {
    getUserMedia.mockRejectedValue(
      new DOMException('Permission denied', 'NotAllowedError'),
    )

    await renderSuspended(Harness)
    await tapScan()

    await vi.waitFor(() => expect(stateText()).toBe('denied'))
  })

  it('enters unsupported when the camera API is unavailable', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: undefined,
      configurable: true,
      writable: true,
    })

    await renderSuspended(Harness)
    await tapScan()

    await vi.waitFor(() => expect(stateText()).toBe('unsupported'))
  })

  it('releases the camera and returns to idle when stopped', async () => {
    const { stream, track } = fakeStream()
    getUserMedia.mockResolvedValue(stream)

    await renderSuspended(Harness)
    await tapScan()
    await vi.waitFor(() => expect(stateText()).toBe('scanning'))

    await userEvent.setup().click(screen.getByRole('button', { name: 'stop' }))

    expect(track.stop).toHaveBeenCalled()
    expect(stateText()).toBe('idle')
  })

  it('releases the camera when the page is hidden while scanning', async () => {
    const { stream, track } = fakeStream()
    getUserMedia.mockResolvedValue(stream)

    await renderSuspended(Harness)
    await tapScan()
    await vi.waitFor(() => expect(stateText()).toBe('scanning'))

    // The user switches apps or locks the screen — iOS keeps the camera light
    // on unless we explicitly stop the tracks.
    setVisibility('hidden')

    await vi.waitFor(() => expect(track.stop).toHaveBeenCalled())
    expect(stateText()).toBe('idle')
  })

  it('records a scan the app was backgrounded out of as interrupted', async () => {
    getUserMedia.mockResolvedValue(fakeStream().stream)
    await renderSuspended(Harness)
    await tapScan()
    await vi.waitFor(() => expect(stateText()).toBe('scanning'))
    expect(screen.getByTestId('interrupted')).toHaveTextContent('false')

    setVisibility('hidden')
    await nextTick()

    expect(screen.getByTestId('interrupted')).toHaveTextContent('true')
  })

  it('counts a refused camera as interrupted, so a return can ask again', async () => {
    // The refusal's own way out is a trip to the settings app and back.
    getUserMedia.mockRejectedValue(
      new DOMException('Permission denied', 'NotAllowedError'),
    )
    await renderSuspended(Harness)
    await tapScan()
    await vi.waitFor(() => expect(stateText()).toBe('denied'))

    setVisibility('hidden')
    await nextTick()

    expect(screen.getByTestId('interrupted')).toHaveTextContent('true')
  })

  it('does not count a scanner the User stopped as interrupted', async () => {
    getUserMedia.mockResolvedValue(fakeStream().stream)
    await renderSuspended(Harness)
    await tapScan()
    await vi.waitFor(() => expect(stateText()).toBe('scanning'))
    await userEvent.setup().click(screen.getByRole('button', { name: 'stop' }))

    setVisibility('hidden')
    await nextTick()

    expect(screen.getByTestId('interrupted')).toHaveTextContent('false')
  })

  it('keeps the interruption on record as the app comes back', async () => {
    // A surface reads it on the same return, after this scanner hears it.
    getUserMedia.mockResolvedValue(fakeStream().stream)
    await renderSuspended(Harness)
    await tapScan()
    await vi.waitFor(() => expect(stateText()).toBe('scanning'))

    setVisibility('hidden')
    setVisibility('visible')
    await nextTick()

    expect(screen.getByTestId('interrupted')).toHaveTextContent('true')
  })
})
