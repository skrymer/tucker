import { beforeEach, describe, expect, it, vi } from 'vitest'
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

const budget = { setupComplete: true, calorieBudget: 2492, proteinFloor: 170 }
let summary: Record<string, unknown> = budget
registerEndpoint('/api/summary', () => summary)

describe('/check before setup is finished', () => {
  it('prompts to finish setup instead of offering a scan', async () => {
    summary = { setupComplete: false, calorieBudget: null, proteinFloor: null }
    vi.clearAllMocks()

    await renderSuspended(Check)

    expect(
      screen.getByText('Finish setup to see your calorie budget'),
    ).toBeVisible()
    expect(scanner.start).not.toHaveBeenCalled()
  })
})

describe('/check with Calorie Tracking off', () => {
  it('says calorie tracking is off rather than that setup is unfinished', async () => {
    // Setup *is* finished — this User has a Profile and a Trend Weight — and the
    // Budget is still absent, which the engine only does for a User who turned
    // Calorie Tracking off. One response answers both, so the page never joins
    // two endpoints to decide what to say.
    summary = { setupComplete: true, calorieBudget: null, proteinFloor: null }
    vi.clearAllMocks()

    await renderSuspended(Check)

    expect(screen.getByText(/calorie tracking is off/i)).toBeVisible()
    expect(screen.queryByText(/finish setup/i)).not.toBeInTheDocument()
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

// No source could be reached, so whether the product exists is still unknown.
registerEndpoint('/api/check/5002222222222', (event) => {
  setResponseStatus(event, 503)
  return {
    message: 'could not reach a nutrition source for barcode 5002222222222',
  }
})

// The source a retry exists for: down, and then back. Two switches drive it —
// `sourceReachable` decides the answer, `lookupGate` holds it open so a test can
// read the screen mid-flight. A test flips a switch rather than the stub
// counting attempts, because an outage that passes is the scenario; an attempt
// count would pin the test to how many times the HTTP client happens to ask.
let sourceReachable = true
let lookupGate: Promise<void> | null = null
registerEndpoint('/api/check/5003333333333', async (event) => {
  if (lookupGate) await lookupGate
  if (!sourceReachable) {
    setResponseStatus(event, 503)
    return { message: 'could not reach a nutrition source' }
  }
  return { ...nutellaCheck, name: 'Recovered bar', barcode: '5003333333333' }
})

/** Hold the next answer open, and hand back the release. */
function gateLookup() {
  let release!: () => void
  lookupGate = new Promise<void>((resolve) => {
    release = resolve
  })
  return release
}

describe('/check with a calorie budget', () => {
  // Every switch above is module state, so each test starts from the same
  // slate — otherwise a test's outcome depends on which ones ran before it.
  beforeEach(() => {
    summary = budget
    scanner.state.value = 'idle'
    scanner.barcode.value = null
    sourceReachable = true
    lookupGate = null
    // The scanner mock is module state too: without this, "the camera started"
    // passes on a call some earlier test made.
    scanner.start.mockClear()
    scanner.stop.mockClear()
  })

  it('starts the camera on arrival and states the product a scan resolves', async () => {
    await renderSuspended(Check)
    expect(scanner.start).toHaveBeenCalled()

    scanner.barcode.value = '3017620422003'
    scanner.state.value = 'decoded'

    expect(await screen.findByText('Nutella')).toBeVisible()
    expect(screen.getByText('21%')).toBeVisible()
    expect(screen.getByText('4%')).toBeVisible()
  })

  it('offers no typed barcode or manual macros when the camera is blocked', async () => {
    scanner.state.value = 'denied'

    await renderSuspended(Check)

    expect(screen.getByText('Camera access is blocked')).toBeVisible()
    // A Check produces nothing, so there is nothing worth typing for — unlike
    // Add-Food, where both manual paths stay always-on peers (ADR 0006).
    expect(screen.queryByLabelText(/barcode/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
  })

  it('ends the tab when the device has no camera to scan with', async () => {
    // A denied camera can be granted; an absent one cannot, so the way out is
    // a different device rather than a settings trip. Either way there is no
    // degraded mode — the accepted trade for a two-second Check (ADR 0022).
    scanner.state.value = 'unsupported'

    await renderSuspended(Check)

    expect(
      screen.getByText('Camera scanning isn’t available here'),
    ).toBeVisible()
    expect(screen.getByText(/Open Tucker on a device with one/)).toBeVisible()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    // Not the blocked-permission message: nothing here is the user's to grant.
    expect(
      screen.queryByText('Camera access is blocked'),
    ).not.toBeInTheDocument()
  })

  it('states plainly that a missed product is not in the food database', async () => {
    // Everything that could be asked was asked, and none of it knew the product.
    // That is a verdict, so it can be asserted rather than hedged — and the
    // advice is to move on, never to keep rescanning.
    await renderSuspended(Check)

    scanner.barcode.value = '9999999999999'
    scanner.state.value = 'decoded'

    expect(await screen.findByText('Not in the food database')).toBeVisible()
    expect(screen.getByText(/9999999999999/)).toBeVisible()
    expect(screen.queryByText('Costs')).not.toBeInTheDocument()
    // Not the retryable message: these two must never be interchangeable.
    expect(screen.queryByText("Couldn't look that up")).not.toBeInTheDocument()
    // Nor the retryable control. Asking again is futile here, so offering it
    // would be advice to stand in a shop repeating a settled answer.
    expect(
      screen.queryByRole('button', { name: 'Try again' }),
    ).not.toBeInTheDocument()
  })

  it('tells a product whose nutrition is incomplete apart from one that is missing', async () => {
    // A 422 is permanent for this product, so the advice must not be "try again"
    // — the opposite of what a transient failure deserves.
    await renderSuspended(Check)

    scanner.barcode.value = '5708888888888'
    scanner.state.value = 'decoded'

    expect(
      await screen.findByText('Not enough nutrition information'),
    ).toBeVisible()
    expect(screen.getByText(/Scanning it again won't help/)).toBeVisible()
    // Distinct from both siblings: the product is known, and retrying is futile.
    expect(
      screen.queryByText('Not in the food database'),
    ).not.toBeInTheDocument()
    expect(screen.queryByText("Couldn't look that up")).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Try again' }),
    ).not.toBeInTheDocument()
  })

  it('says the lookup did not get through, not that the targets failed', async () => {
    // The targets loaded fine — they are what the Check is measured against, and
    // blaming them would send the user off to fix something that isn't broken.
    await renderSuspended(Check)

    scanner.barcode.value = '5002222222222'
    scanner.state.value = 'decoded'

    expect(await screen.findByText("Couldn't look that up")).toBeVisible()
    expect(screen.queryByText(/your targets/i)).not.toBeInTheDocument()
    // And never a claim about the package: nobody found out whether it exists.
    expect(screen.queryByText('Costs')).not.toBeInTheDocument()
    // The advice has to match the control beside it. "Try again" re-asks the
    // same question, so sending the user back to the camera would point at the
    // wrong button — and cost a re-aim for a step that never failed.
    expect(screen.getByText(/Try again in a moment/)).toBeVisible()
    expect(screen.queryByText(/scanning it again/i)).not.toBeInTheDocument()
  })

  it('does not blame the product when the lookup itself fails', async () => {
    await renderSuspended(Check)

    scanner.barcode.value = '5001111111111'
    scanner.state.value = 'decoded'

    expect(await screen.findByText("Couldn't look that up")).toBeVisible()
    // Never a claim about the package the user is holding, on the strength of a
    // server error — the product may be perfectly well known.
    expect(
      screen.queryByText(/not in the food database/i),
    ).not.toBeInTheDocument()
  })

  it('re-runs the failed lookup without sending the user back to the package', async () => {
    // The decode succeeded; only the round-trip failed. Retrying the scan would
    // cost a re-aim in a shop aisle to redo work that never broke.
    sourceReachable = false

    await renderSuspended(Check)

    scanner.barcode.value = '5003333333333'
    scanner.state.value = 'decoded'

    expect(await screen.findByText("Couldn't look that up")).toBeVisible()

    sourceReachable = true
    scanner.start.mockClear()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Recovered bar')).toBeVisible()
    expect(scanner.start).not.toHaveBeenCalled()
    // The answer replaces the failure rather than joining it, or a resolved
    // product would sit under a banner saying it couldn't be looked up.
    expect(screen.queryByText("Couldn't look that up")).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Try again' }),
    ).not.toBeInTheDocument()
  })

  it('keeps the failure on screen while the retry is in flight', async () => {
    // The user is looking at this message when they tap the button inside it,
    // so it stays put and the control responds in place — rather than the
    // screen blanking and reflowing under their thumb.
    sourceReachable = false

    await renderSuspended(Check)

    scanner.barcode.value = '5003333333333'
    scanner.state.value = 'decoded'

    expect(await screen.findByText("Couldn't look that up")).toBeVisible()

    const button = () => screen.getByRole('button', { name: 'Try again' })
    expect(button()).toBeEnabled()

    const release = gateLookup()
    await userEvent.click(button())

    await vi.waitFor(() => expect(button()).toBeDisabled(), { timeout: 3000 })
    expect(screen.getByText("Couldn't look that up")).toBeVisible()
    expect(screen.queryByText('Looking it up…')).not.toBeInTheDocument()

    release()
    // And it hands the control back, rather than leaving a dead button behind.
    await vi.waitFor(() => expect(button()).toBeEnabled(), { timeout: 3000 })
  })

  it('offers the retry immediately, without a spinner for a request that already finished', async () => {
    // The in-flight flag lingers past the answer, to stop spinners flickering.
    // A button is not a spinner: a tap in that window is the user asking again,
    // and swallowing it leaves them pressing a dead control in a shop.
    const release = gateLookup()
    sourceReachable = false

    await renderSuspended(Check)

    scanner.barcode.value = '5003333333333'
    scanner.state.value = 'decoded'

    // Long enough that the delayed in-flight flag has certainly latched, so its
    // linger is still running when the answer lands.
    await new Promise((resolve) => setTimeout(resolve, 250))
    release()

    expect(await screen.findByText("Couldn't look that up")).toBeVisible()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled()
  })

  it('shows the recovered product without flashing the lookup message over it', async () => {
    // A retry that succeeds replaces the alert with the answer. The delayed
    // in-flight flag is still set at that moment, so a screen keyed on it alone
    // blanks to "Looking it up…" *after* the answer arrived — the reflow the
    // held alert exists to avoid, moved to the end of the round trip. Sampling
    // every macrotask catches it; awaiting the result would wait it out.
    sourceReachable = false

    await renderSuspended(Check)

    scanner.barcode.value = '5003333333333'
    scanner.state.value = 'decoded'
    expect(await screen.findByText("Couldn't look that up")).toBeVisible()

    sourceReachable = true
    const release = gateLookup()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    await vi.waitFor(
      () =>
        expect(
          screen.getByRole('button', { name: 'Try again' }),
        ).toBeDisabled(),
      { timeout: 3000 },
    )
    release()

    let sawLookingUp = false
    let sawRecovered = false
    const deadline = Date.now() + 3000
    while (!sawRecovered && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 0))
      const rendered = document.body.textContent ?? ''
      if (rendered.includes('Looking it up')) sawLookingUp = true
      if (rendered.includes('Recovered bar')) sawRecovered = true
    }

    expect(sawRecovered).toBe(true)
    expect(sawLookingUp).toBe(false)
  })

  it('clears the previous result and restarts the camera on Scan another', async () => {
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
