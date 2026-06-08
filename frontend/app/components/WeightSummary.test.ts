import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import WeightSummary from './WeightSummary.vue'

describe('WeightSummary', () => {
  it('shows the latest reading as a headline weight and date', async () => {
    await renderSuspended(WeightSummary, {
      props: {
        latest: { id: 2, measuredOn: '2026-05-28', weightKg: 84.2 },
        previous: null,
      },
    })

    expect(screen.getByText('84.2 kg')).toBeVisible()
    expect(screen.getByText('28 May 2026')).toBeVisible()
  })

  it('shows a downward delta when the latest reading is lighter than the previous', async () => {
    await renderSuspended(WeightSummary, {
      props: {
        latest: { id: 2, measuredOn: '2026-05-28', weightKg: 84.2 },
        previous: { id: 1, measuredOn: '2026-05-27', weightKg: 84.6 },
      },
    })

    expect(screen.getByLabelText(/down 0\.4 kg/i)).toBeVisible()
  })

  it('shows an upward delta when the latest reading is heavier than the previous', async () => {
    await renderSuspended(WeightSummary, {
      props: {
        latest: { id: 2, measuredOn: '2026-05-28', weightKg: 84.9 },
        previous: { id: 1, measuredOn: '2026-05-27', weightKg: 84.6 },
      },
    })

    expect(screen.getByLabelText(/up 0\.3 kg/i)).toBeVisible()
  })

  it('shows a no-change indicator when the latest matches the previous', async () => {
    await renderSuspended(WeightSummary, {
      props: {
        latest: { id: 2, measuredOn: '2026-05-28', weightKg: 84.6 },
        previous: { id: 1, measuredOn: '2026-05-27', weightKg: 84.6 },
      },
    })

    expect(screen.getByLabelText(/no change/i)).toBeVisible()
    expect(screen.queryByLabelText(/up 0\.0 kg/i)).toBeNull()
    expect(screen.queryByLabelText(/down 0\.0 kg/i)).toBeNull()
  })

  it('reports the delta of the displayed (rounded) weights, not the raw float', async () => {
    // 84.75 renders as "84.8" and 84.70 as "84.7" — a visible 0.1 kg change.
    // The raw float difference is 0.04999…, so a naive `< 0.05` check would
    // wrongly read "No change" while the numbers beside it differ.
    await renderSuspended(WeightSummary, {
      props: {
        latest: { id: 2, measuredOn: '2026-05-28', weightKg: 84.75 },
        previous: { id: 1, measuredOn: '2026-05-27', weightKg: 84.7 },
      },
    })

    expect(screen.getByText('84.8 kg')).toBeVisible()
    expect(screen.getByLabelText(/up 0\.1 kg/i)).toBeVisible()
    expect(screen.queryByLabelText(/no change/i)).toBeNull()
  })

  it('shows no delta when there is only a single reading', async () => {
    await renderSuspended(WeightSummary, {
      props: {
        latest: { id: 1, measuredOn: '2026-05-28', weightKg: 84.2 },
        previous: null,
      },
    })

    expect(screen.getByText('84.2 kg')).toBeVisible()
    expect(screen.queryByLabelText(/down/i)).toBeNull()
    expect(screen.queryByLabelText(/up/i)).toBeNull()
    expect(screen.queryByLabelText(/no change/i)).toBeNull()
  })

  it('renders nothing when there is no reading at all', async () => {
    const { html } = await renderSuspended(WeightSummary, {
      props: { latest: null, previous: null },
    })

    expect(screen.queryByText('Latest')).toBeNull()
    expect(html()).not.toContain('kg')
  })
})
