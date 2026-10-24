import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import type { components } from '#open-fetch-schemas/api'
import { UApp } from '#components'
import { noWebVitals, vitalIn } from '~~/test/mocks/handlers/metrics'
import WebVitalsCard from './WebVitalsCard.vue'

type WebVitals = components['schemas']['WebVitalsResponse']

/** Inside the app's root, as on the page, which provides what its tooltips need. */
function renderCard(webVitals: Partial<WebVitals>) {
  return renderSuspended(
    defineComponent({
      render: () =>
        h(UApp, () =>
          h(WebVitalsCard, { webVitals: { ...noWebVitals(), ...webVitals } }),
        ),
    }),
  )
}

describe('WebVitalsCard', () => {
  it('is headed as page load and interaction, over every page', async () => {
    await renderCard({})

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Page load and interaction',
      }),
    ).toBeVisible()
    expect(
      screen.getByText("Each layout's p75, whichever page it happened on"),
    ).toBeVisible()
  })

  it("states each layout's p75 page load", async () => {
    await renderCard({
      lcp: [
        vitalIn('phone', 20, { p50: 1_800, p75: 2_140, p95: 3_900 }),
        vitalIn('desktop', 12, { p50: 700, p75: 920, p95: 1_500 }),
      ],
    })

    const pageLoad = within(
      screen.getByRole('region', { name: 'Page load (LCP)' }),
    )
    expect(pageLoad.getByRole('row', { name: 'Phone 2140 ms' })).toBeVisible()
    expect(pageLoad.getByRole('row', { name: 'Desktop 920 ms' })).toBeVisible()
  })

  it("states each layout's p75 interaction apart from page load", async () => {
    await renderCard({
      inp: [
        vitalIn('phone', 9, { p50: 120, p75: 180, p95: 260 }),
        vitalIn('desktop', 30, { p50: 40, p75: 64, p95: 96 }),
      ],
    })

    const interaction = within(
      screen.getByRole('region', { name: 'Interaction (INP)' }),
    )
    expect(interaction.getByRole('row', { name: 'Phone 180 ms' })).toBeVisible()
    expect(
      interaction.getByRole('row', { name: 'Desktop 64 ms' }),
    ).toBeVisible()
  })

  it("shows a layout's every figure on hover", async () => {
    const user = userEvent.setup()
    await renderCard({
      inp: [
        vitalIn('phone', 9, { p50: 120, p75: 180, p95: 260 }),
        vitalIn('desktop', 0),
      ],
    })

    const interaction = within(
      screen.getByRole('region', { name: 'Interaction (INP)' }),
    )
    const figure = interaction.getByText('180 ms')
    await user.hover(figure)

    await vi.waitFor(() =>
      expect(figure).toHaveAccessibleDescription(
        'n 9 · p50 120 ms · p75 180 ms · p95 260 ms',
      ),
    )
  })

  it('says a layout has too few samples for a figure, and how many', async () => {
    await renderCard({ lcp: [vitalIn('phone', 3), vitalIn('desktop', 0)] })

    const pageLoad = within(
      screen.getByRole('region', { name: 'Page load (LCP)' }),
    )
    expect(
      pageLoad.getByRole('row', { name: 'Phone too few (n 3)' }),
    ).toBeVisible()
    expect(
      pageLoad.getByRole('row', { name: 'Desktop too few (n 0)' }),
    ).toBeVisible()
  })
})
