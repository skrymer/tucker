import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { readBarcodes } from 'zxing-wasm/reader'
import { useBarcodeScanner } from './useBarcodeScanner'

// The camera and the WASM decoder are the two things a unit test can't run for
// real (ADR 0006: the live lifecycle is covered by a real-stack smoke). Here we
// mock both and assert the exposed state machine + decoded barcode — never the
// mock internals.
vi.mock('zxing-wasm/reader', () => ({ readBarcodes: vi.fn(async () => []) }))

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
      <video ref="videoEl"></video>
      <button @click="start">scan</button>
      <button @click="stop">stop</button>
    </div>
  `,
})

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
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    await vi.waitFor(() => expect(track.stop).toHaveBeenCalled())
    expect(stateText()).toBe('idle')
  })
})
