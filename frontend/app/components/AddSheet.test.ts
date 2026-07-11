import { describe, expect, it, vi } from 'vitest'
import { registerEndpoint, renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { readBarcodes } from 'zxing-wasm/reader'
import AddSheet from './AddSheet.vue'

// The camera scanner's hardware + WASM decoder are mocked (ADR 0006: the live
// lifecycle is a real-stack smoke). These helpers drive the sheet's camera
// states through the same seams the useBarcodeScanner unit tests use.
vi.mock('zxing-wasm/reader', () => ({ readBarcodes: vi.fn(async () => []) }))

function mockCameraGranted(barcode?: string) {
  const track = { stop: vi.fn(), kind: 'video' }
  const stream = { getTracks: () => [track] } as unknown as MediaStream
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn(async () => stream) },
    configurable: true,
    writable: true,
  })
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
  vi.mocked(readBarcodes).mockResolvedValue(
    barcode
      ? ([{ isValid: true, text: barcode }] as unknown as Awaited<
          ReturnType<typeof readBarcodes>
        >)
      : [],
  )
  return { track }
}

function mockCameraDenied() {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: {
      getUserMedia: vi.fn(async () => {
        throw new DOMException('Permission denied', 'NotAllowedError')
      }),
    },
    configurable: true,
    writable: true,
  })
}

/** Let the decode loop grab a frame: give the <video> a frame and a 2D context. */
function primeVideoFrame() {
  const video = document.querySelector('video')
  if (video) {
    Object.defineProperty(video, 'readyState', { value: 4, configurable: true })
    Object.defineProperty(video, 'videoWidth', {
      value: 640,
      configurable: true,
    })
    Object.defineProperty(video, 'videoHeight', {
      value: 480,
      configurable: true,
    })
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
  } as unknown as CanvasRenderingContext2D)
}

// The mock router matches concrete paths only (no params), so each scenario
// registers its own barcode. A distinct barcode per outcome keeps them apart.
const CANDIDATE_BARCODE = '5701234567890'
registerEndpoint(`/api/foods/barcode/${CANDIDATE_BARCODE}`, {
  method: 'GET',
  handler: () => ({
    outcome: 'CANDIDATE',
    candidate: {
      name: 'Skyr Natural',
      barcode: CANDIDATE_BARCODE,
      proteinPer100g: 10.3,
      carbsPer100g: 4,
      fatPer100g: null,
      statedEnergyKcalPer100g: 63,
      source: 'Open Food Facts',
    },
  }),
})

// A candidate look-up that resolves only once the test opens the gate, so the
// user can type while it's still in flight.
let candidateGate: Promise<unknown> | null = null
const SLOW_CANDIDATE_BARCODE = '5700000000001'
registerEndpoint(`/api/foods/barcode/${SLOW_CANDIDATE_BARCODE}`, {
  method: 'GET',
  handler: async () => {
    if (candidateGate) await candidateGate
    return {
      outcome: 'CANDIDATE',
      candidate: {
        name: 'Skyr Natural',
        barcode: SLOW_CANDIDATE_BARCODE,
        proteinPer100g: 10.3,
        carbsPer100g: 4,
        fatPer100g: null,
        statedEnergyKcalPer100g: 63,
        source: 'Open Food Facts',
      },
    }
  },
})

const EXISTING_BARCODE = '5709999999999'
registerEndpoint(`/api/foods/barcode/${EXISTING_BARCODE}`, {
  method: 'GET',
  handler: () => ({
    outcome: 'EXISTING',
    food: {
      id: 7,
      name: 'Existing Skyr',
      kind: 'FOOD',
      barcode: EXISTING_BARCODE,
      caloriesPer100g: 63,
      proteinPer100g: 10,
      carbsPer100g: 4,
      fatPer100g: 0.2,
      cookedWeightG: null,
    },
  }),
})

describe('AddSheet', () => {
  it('offers a barcode lookup alongside the manual form', async () => {
    await renderSuspended(AddSheet, { props: { open: true } })

    expect(screen.getByLabelText(/barcode/i)).toBeVisible()
    expect(screen.getByRole('button', { name: /look up/i })).toBeVisible()
    // Manual entry is an always-on peer, not gated behind the lookup.
    expect(screen.getByLabelText(/^name$/i)).toBeVisible()
  })

  it('marks the barcode as an optional shortcut', async () => {
    await renderSuspended(AddSheet, { props: { open: true } })

    expect(screen.getByText(/^optional$/i)).toBeVisible()
  })

  it('frames the barcode as an optional pre-fill for the form', async () => {
    await renderSuspended(AddSheet, { props: { open: true } })

    expect(screen.getByText(/pre-fill from a barcode/i)).toBeVisible()
  })

  it('prefills the form from a provider candidate after lookup', async () => {
    await renderSuspended(AddSheet, { props: { open: true } })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/barcode/i), CANDIDATE_BARCODE)
    await user.click(screen.getByRole('button', { name: /look up/i }))

    expect(await screen.findByDisplayValue('Skyr Natural')).toBeVisible()
    expect(screen.getByLabelText(/protein \/100\s*g/i)).toHaveDisplayValue(
      '10.3',
    )
    // Absent macro stays blank and the stated energy shows as a cross-check.
    expect(screen.getByLabelText(/fat \/100\s*g/i)).toHaveDisplayValue('')
    expect(screen.getByText(/63 kcal/i)).toBeVisible()
  })

  it('keeps what the user typed when a slow look-up lands a candidate', async () => {
    let releaseLookup!: () => void
    candidateGate = new Promise((resolve) => (releaseLookup = resolve))
    await renderSuspended(AddSheet, { props: { open: true } })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/barcode/i), SLOW_CANDIDATE_BARCODE)
    await user.click(screen.getByRole('button', { name: /look up/i }))

    // The look-up is still in flight; the user starts typing a name.
    await user.type(screen.getByLabelText(/^name$/i), 'My Skyr')

    // The candidate now resolves and fills the blank protein field.
    releaseLookup()
    await vi.waitFor(() =>
      expect(screen.getByLabelText(/protein \/100\s*g/i)).toHaveDisplayValue(
        '10.3',
      ),
    )

    // The typed name survived; only the blank macro filled.
    expect(screen.getByLabelText(/^name$/i)).toHaveValue('My Skyr')
    candidateGate = null
  })

  it('notes that the form was pre-filled from the provider after a candidate lookup', async () => {
    await renderSuspended(AddSheet, { props: { open: true } })
    const user = userEvent.setup()

    // No note before a look-up — nothing has been pre-filled.
    expect(
      screen.queryByText(/filled from open food facts/i),
    ).not.toBeInTheDocument()

    await user.type(screen.getByLabelText(/barcode/i), CANDIDATE_BARCODE)
    await user.click(screen.getByRole('button', { name: /look up/i }))

    expect(
      await screen.findByText(/filled from open food facts/i),
    ).toBeVisible()
  })

  it('surfaces an existing catalog Food instead of the add form', async () => {
    await renderSuspended(AddSheet, { props: { open: true } })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/barcode/i), EXISTING_BARCODE)
    await user.click(screen.getByRole('button', { name: /look up/i }))

    expect(await screen.findByText(/already in your catalog/i)).toBeVisible()
    expect(screen.getByText('Existing Skyr')).toBeVisible()
    // The add form gives way to the existing Food.
    expect(screen.queryByLabelText(/^name$/i)).not.toBeInTheDocument()
  })

  it('leads a catalog hit with the option to log it now', async () => {
    await renderSuspended(AddSheet, { props: { open: true } })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/barcode/i), EXISTING_BARCODE)
    await user.click(screen.getByRole('button', { name: /look up/i }))

    expect(
      await screen.findByRole('button', { name: /log it now/i }),
    ).toBeVisible()
    expect(screen.getByLabelText(/grams/i)).toBeVisible()
  })

  it('offers to log a Food the parent just saved', async () => {
    const createdFood = {
      id: 99,
      name: 'Saved Skyr',
      kind: 'FOOD',
      caloriesPer100g: 63,
      proteinPer100g: 10,
      carbsPer100g: 4,
      fatPer100g: 0.2,
      cookedWeightG: null,
    }
    await renderSuspended(AddSheet, {
      props: { open: true, createdFood },
    })

    expect(screen.getByRole('button', { name: /log it now/i })).toBeVisible()
    expect(screen.getByLabelText(/grams/i)).toBeVisible()
    // The add form gives way to the continuation once the Food exists.
    expect(screen.queryByLabelText(/^name$/i)).not.toBeInTheDocument()
  })

  it('forwards the weighed-entry payload when the user logs it', async () => {
    const createdFood = {
      id: 99,
      name: 'Saved Skyr',
      kind: 'FOOD',
      caloriesPer100g: 63,
      proteinPer100g: 10,
      carbsPer100g: 4,
      fatPer100g: 0.2,
      cookedWeightG: null,
    }
    const onLog = vi.fn()
    await renderSuspended(AddSheet, {
      props: { open: true, createdFood, onLog },
    })
    const user = userEvent.setup()

    await user.click(screen.getByLabelText(/grams/i))
    await user.keyboard('120')
    await user.click(screen.getByRole('button', { name: /log it now/i }))

    expect(onLog).toHaveBeenCalledWith({ foodId: 99, grams: 120 })
  })

  it('resets to a fresh add form after closing and reopening', async () => {
    const { rerender } = await renderSuspended(AddSheet, {
      props: { open: true },
    })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/barcode/i), EXISTING_BARCODE)
    await user.click(screen.getByRole('button', { name: /look up/i }))
    await screen.findByRole('button', { name: /log it now/i })

    // The parent closes the sheet, then the user reopens it for a new food.
    await rerender({ open: false })
    await rerender({ open: true })

    // The stale catalog hit is gone; the add form leads again.
    expect(screen.getByLabelText(/^name$/i)).toBeVisible()
    expect(
      screen.queryByRole('button', { name: /log it now/i }),
    ).not.toBeInTheDocument()
  })

  it('drops to a blank form carrying the barcode on a miss', async () => {
    // MISS_BARCODE is intentionally unregistered, so the lookup 404s.
    const MISS_BARCODE = '0000000000000'
    const onSubmit = vi.fn()
    await renderSuspended(AddSheet, { props: { open: true, onSubmit } })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/barcode/i), MISS_BARCODE)
    await user.click(screen.getByRole('button', { name: /look up/i }))

    // Blank form — no candidate prefill — and no stated-energy note.
    await vi.waitFor(() =>
      expect(screen.getByLabelText(/^name$/i)).toHaveValue(''),
    )
    expect(screen.queryByText(/stated/i)).not.toBeInTheDocument()

    await user.type(screen.getByLabelText(/^name$/i), 'Hand typed')
    await user.type(screen.getByLabelText(/protein \/100\s*g/i), '5')
    await user.type(screen.getByLabelText(/carbs \/100\s*g/i), '5')
    await user.type(screen.getByLabelText(/fat \/100\s*g/i), '5')
    await user.click(screen.getByRole('button', { name: /save food/i }))

    // The typed barcode rides along to the created Food.
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Hand typed', barcode: MISS_BARCODE }),
    )
  })

  it('degrades to manual entry carrying the barcode when the lookup fails offline', async () => {
    // Decoding runs locally and still works offline, but the lookup needs the
    // network. A network-failed lookup must degrade to the same barcode-pre-filled
    // manual entry as a miss (ADR 0006) so the user can still add the Food.
    const OFFLINE_BARCODE = '5703333333333'
    registerEndpoint(`/api/foods/barcode/${OFFLINE_BARCODE}`, {
      method: 'GET',
      handler: () => {
        throw new Error('network down')
      },
    })
    const onSubmit = vi.fn()
    await renderSuspended(AddSheet, { props: { open: true, onSubmit } })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/barcode/i), OFFLINE_BARCODE)
    await user.click(screen.getByRole('button', { name: /look up/i }))

    // Manual entry is available with a blank form — no candidate prefill.
    await vi.waitFor(() =>
      expect(screen.getByLabelText(/^name$/i)).toHaveValue(''),
    )

    await user.type(screen.getByLabelText(/^name$/i), 'Hand typed')
    await user.type(screen.getByLabelText(/protein \/100\s*g/i), '5')
    await user.type(screen.getByLabelText(/carbs \/100\s*g/i), '5')
    await user.type(screen.getByLabelText(/fat \/100\s*g/i), '5')
    await user.click(screen.getByRole('button', { name: /save food/i }))

    // The typed barcode rides along, so no work is lost to the failed lookup.
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Hand typed', barcode: OFFLINE_BARCODE }),
    )
  })

  it('shows the add-food form when open', async () => {
    await renderSuspended(AddSheet, { props: { open: true } })

    expect(screen.getByRole('dialog', { name: /add food/i })).toBeVisible()
    expect(screen.getByLabelText(/^name$/i)).toBeVisible()
    expect(screen.getByLabelText(/protein \/100\s*g/i)).toBeVisible()
    expect(screen.getByLabelText(/carbs \/100\s*g/i)).toBeVisible()
    expect(screen.getByLabelText(/fat \/100\s*g/i)).toBeVisible()
  })

  it('emits the new-food payload when the user saves', async () => {
    const onSubmit = vi.fn()
    await renderSuspended(AddSheet, {
      props: { open: true, onSubmit },
    })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/^name$/i), 'Skyr')
    await user.type(screen.getByLabelText(/protein \/100\s*g/i), '10')
    await user.type(screen.getByLabelText(/carbs \/100\s*g/i), '4')
    await user.type(screen.getByLabelText(/fat \/100\s*g/i), '0.2')
    await user.click(screen.getByRole('button', { name: /save food/i }))

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Skyr',
      proteinPer100g: 10,
      carbsPer100g: 4,
      fatPer100g: 0.2,
    })
  })

  it('offers a Food or Recipe switch, defaulting to the Food builder', async () => {
    await renderSuspended(AddSheet, { props: { open: true, foods: [] } })

    expect(screen.getByRole('tab', { name: /food/i })).toBeVisible()
    expect(screen.getByRole('tab', { name: /recipe/i })).toBeVisible()
    // The Food builder leads by default.
    expect(screen.getByLabelText(/^name$/i)).toBeVisible()
  })

  it('switches to the recipe builder when Recipe is chosen', async () => {
    const user = userEvent.setup()
    await renderSuspended(AddSheet, { props: { open: true, foods: [] } })

    await user.click(screen.getByRole('tab', { name: /recipe/i }))

    expect(screen.getByLabelText(/recipe name/i)).toBeVisible()
    // The Food form gives way to the recipe builder (its panel stays mounted so
    // in-progress input survives a tab round-trip, but is hidden).
    expect(screen.getByLabelText(/^name$/i)).not.toBeVisible()
  })

  it('keeps the recipe draft when toggling to Food and back', async () => {
    const user = userEvent.setup()
    await renderSuspended(AddSheet, { props: { open: true, foods: [] } })

    await user.click(screen.getByRole('tab', { name: /recipe/i }))
    await user.type(screen.getByLabelText(/recipe name/i), 'Cottage pie')
    await user.click(screen.getByRole('tab', { name: /food/i }))
    await user.click(screen.getByRole('tab', { name: /recipe/i }))

    // The half-built recipe survives the round-trip (panel not unmounted).
    expect(screen.getByLabelText(/recipe name/i)).toHaveValue('Cottage pie')
  })
})

describe('AddSheet camera scanning', () => {
  it('offers a Scan barcode button alongside the manual input', async () => {
    mockCameraGranted()
    await renderSuspended(AddSheet, { props: { open: true } })

    expect(screen.getByRole('button', { name: /scan barcode/i })).toBeVisible()
    // The manual barcode input stays an always-on peer of the camera.
    expect(screen.getByLabelText(/barcode/i)).toBeVisible()
  })

  it('shows the live viewfinder and a Stop control while scanning', async () => {
    mockCameraGranted()
    await renderSuspended(AddSheet, { props: { open: true } })

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /scan barcode/i }))

    expect(await screen.findByText(/point the camera/i)).toBeVisible()
    expect(screen.getByRole('button', { name: /stop/i })).toBeVisible()
  })

  it('runs the lookup on a decoded barcode and pre-fills the candidate', async () => {
    // A decoded barcode must branch identically to a typed one (ADR 0006).
    mockCameraGranted(CANDIDATE_BARCODE)
    await renderSuspended(AddSheet, { props: { open: true } })

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /scan barcode/i }))
    await screen.findByText(/point the camera/i)
    primeVideoFrame()

    expect(
      await screen.findByDisplayValue('Skyr Natural', undefined, {
        timeout: 3000,
      }),
    ).toBeVisible()
  })

  it('falls back to the manual input when the camera is denied', async () => {
    mockCameraDenied()
    await renderSuspended(AddSheet, { props: { open: true } })

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /scan barcode/i }))

    expect(await screen.findByText(/camera access is blocked/i)).toBeVisible()
    // The manual barcode input is still usable after a denial.
    expect(screen.getByLabelText(/barcode/i)).toBeVisible()
    expect(screen.getByRole('button', { name: /look up/i })).toBeVisible()
  })

  it('shows requesting feedback while the permission prompt is pending', async () => {
    // A deferred getUserMedia keeps the scanner in `requesting` so the
    // (otherwise transient) feedback is deterministically observable.
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn(() => new Promise(() => {})) },
      configurable: true,
      writable: true,
    })
    await renderSuspended(AddSheet, { props: { open: true } })

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /scan barcode/i }))

    expect(await screen.findByText(/requesting camera/i)).toBeVisible()
  })

  it('releases the camera when the sheet is closed', async () => {
    const { track } = mockCameraGranted()
    const { rerender } = await renderSuspended(AddSheet, {
      props: { open: true },
    })

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /scan barcode/i }))
    await screen.findByText(/point the camera/i)

    // The parent closes the sheet (e.g. after a save) by flipping the prop.
    await rerender({ open: false })

    await vi.waitFor(() => expect(track.stop).toHaveBeenCalled())
  })

  it('falls back to the manual input when scanning is unsupported', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: undefined,
      configurable: true,
      writable: true,
    })
    await renderSuspended(AddSheet, { props: { open: true } })

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /scan barcode/i }))

    expect(
      await screen.findByText(/scanning isn't available here/i),
    ).toBeVisible()
    expect(screen.getByLabelText(/barcode/i)).toBeVisible()
  })
})
