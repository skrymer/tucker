import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import {
  mockNuxtImport,
  registerEndpoint,
  renderSuspended,
} from '@nuxt/test-utils/runtime'
import { setResponseStatus } from 'h3'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { nutellaCheck } from '~~/test/check-fixtures'
import Check from './check.vue'

// The scanner is stubbed so a scan can be driven from a test: jsdom has no
// camera, and the real composable's states are exercised by the Playwright
// suites against a fake media stream.
const scanner = {
  state: ref('idle'),
  barcode: ref<string | null>(null),
  videoEl: ref(null),
  start: vi.fn(),
  stop: vi.fn(),
}
mockNuxtImport('useBarcodeScanner', () => () => scanner)

const budget = { calorieBudget: 2492, proteinFloor: 170 }
let summary: Record<string, unknown> = budget
registerEndpoint('/api/summary', () => summary)

describe('/check before setup is finished', () => {
  it('prompts to finish setup instead of offering a scan', async () => {
    summary = { calorieBudget: null, proteinFloor: null }

    await renderSuspended(Check)

    expect(
      screen.getByText('Finish setup to see your calorie budget'),
    ).toBeVisible()
    expect(scanner.start).not.toHaveBeenCalled()
  })
})

registerEndpoint('/api/check/3017620422003', () => nutellaCheck)

// A Provider that knows the product but not all three macros — permanent (422).
registerEndpoint('/api/check/5708888888888', (event) => {
  setResponseStatus(event, 422)
  return {
    message: 'Open Food Facts has no complete nutrition for Mystery bar',
  }
})

// The lookup itself failing, which says nothing about the product.
registerEndpoint('/api/check/5001111111111', (event) => {
  setResponseStatus(event, 500)
  return { message: 'boom' }
})

describe('/check with a calorie budget', () => {
  it('starts the camera on arrival and states the product a scan resolves', async () => {
    summary = budget
    scanner.state.value = 'idle'
    scanner.barcode.value = null

    await renderSuspended(Check)
    expect(scanner.start).toHaveBeenCalled()

    scanner.barcode.value = '3017620422003'
    scanner.state.value = 'decoded'

    expect(await screen.findByText('Nutella')).toBeVisible()
    expect(screen.getByText('21%')).toBeVisible()
    expect(screen.getByText('4%')).toBeVisible()
  })

  it('offers no typed barcode or manual macros when the camera is blocked', async () => {
    summary = budget
    scanner.state.value = 'denied'
    scanner.barcode.value = null

    await renderSuspended(Check)

    expect(screen.getByText('Camera access is blocked')).toBeVisible()
    // A Check produces nothing, so there is nothing worth typing for — unlike
    // Add-Food, where both manual paths stay always-on peers (ADR 0006).
    expect(screen.queryByLabelText(/barcode/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
  })

  it('says nothing came back rather than showing an empty analysis', async () => {
    summary = budget
    scanner.state.value = 'idle'
    scanner.barcode.value = null

    await renderSuspended(Check)

    scanner.barcode.value = '9999999999999'
    scanner.state.value = 'decoded'

    expect(await screen.findByText('Nothing came back')).toBeVisible()
    expect(screen.queryByText('Costs')).not.toBeInTheDocument()
  })

  it('tells a product whose nutrition is incomplete apart from one that is missing', async () => {
    // A 422 is permanent for this product, so the advice must not be "try again"
    // — the opposite of what a transient failure deserves.
    summary = budget
    scanner.state.value = 'idle'
    scanner.barcode.value = null

    await renderSuspended(Check)

    scanner.barcode.value = '5708888888888'
    scanner.state.value = 'decoded'

    expect(
      await screen.findByText('Not enough nutrition information'),
    ).toBeVisible()
    expect(screen.getByText(/Scanning it again won't help/)).toBeVisible()
    expect(screen.queryByText('Nothing came back')).not.toBeInTheDocument()
  })

  it('does not blame the product when the lookup itself fails', async () => {
    summary = budget
    scanner.state.value = 'idle'
    scanner.barcode.value = null

    await renderSuspended(Check)

    scanner.barcode.value = '5001111111111'
    scanner.state.value = 'decoded'

    expect(
      await screen.findByText("Couldn't check that right now"),
    ).toBeVisible()
    // Never "no such product" — that would be a claim about the package the
    // user is holding, on the strength of a server error.
    expect(screen.queryByText('Nothing came back')).not.toBeInTheDocument()
  })

  it('clears the previous result and restarts the camera on Scan another', async () => {
    summary = budget
    scanner.state.value = 'idle'
    scanner.barcode.value = null

    await renderSuspended(Check)

    scanner.barcode.value = '3017620422003'
    scanner.state.value = 'decoded'
    expect(await screen.findByText('Nutella')).toBeVisible()

    scanner.start.mockClear()
    await userEvent.click(screen.getByRole('button', { name: 'Scan another' }))

    expect(scanner.start).toHaveBeenCalled()
    expect(screen.queryByText('Nutella')).not.toBeInTheDocument()
    expect(screen.queryByText('Costs')).not.toBeInTheDocument()
  })
})
