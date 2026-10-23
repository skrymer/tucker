import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import ReleaseTrendCard from './ReleaseTrendCard.vue'

// unovis' tooltip, stubbed: happy-dom's `MutationObserver.disconnect` throws on
// the observer it tears down on unmount. The browser layers render it for real.
vi.mock('@unovis/vue', async (actual) => ({
  ...(await actual<typeof import('@unovis/vue')>()),
  VisTooltip: { render: () => null },
}))

const release = (
  version: string,
  phone: { n: number; p75: number | null },
  desktop: { n: number; p75: number | null },
) => ({
  version,
  layouts: [
    { layout: 'phone' as const, ...phone },
    { layout: 'desktop' as const, ...desktop },
  ],
})

const rowsOf = (table: HTMLElement) =>
  within(table)
    .getAllByRole('row')
    .map((row) =>
      [...row.querySelectorAll('th, td')].map((cell) =>
        cell.textContent?.trim(),
      ),
    )

describe('ReleaseTrendCard', () => {
  // Colour is never the only signal: each line is named in words.
  it('names the phone and desktop lines in a legend', async () => {
    await renderSuspended(ReleaseTrendCard, { props: { routes: [] } })

    const legend = screen.getByRole('list', { name: 'Layouts' })
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map((item) => item.textContent?.trim()),
    ).toEqual(['Phone', 'Desktop'])
  })

  // The chart is drawn for the eye; every figure it plots is stated in its table.
  it("gives each route a chart whose table states each release's p75 per layout, or why there is none", async () => {
    await renderSuspended(ReleaseTrendCard, {
      props: {
        routes: [
          {
            route: '/foods',
            releases: [
              release('0.1.9', { n: 20, p75: 450 }, { n: 3, p75: null }),
              release('0.1.10', { n: 0, p75: null }, { n: 12, p75: 180 }),
            ],
          },
          {
            route: '/review',
            releases: [
              release('0.1.9', { n: 8, p75: 900 }, { n: 6, p75: 400 }),
              release('0.1.10', { n: 9, p75: 700 }, { n: 4, p75: null }),
            ],
          },
        ],
      },
    })

    expect(
      screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent),
    ).toEqual(['/foods', '/review'])
    expect(rowsOf(screen.getByRole('table', { name: '/foods' }))).toEqual([
      ['Release', 'Phone', 'Desktop'],
      ['0.1.9', '450 ms', 'too few (n 3)'],
      ['0.1.10', 'too few (n 0)', '180 ms'],
    ])
    expect(rowsOf(screen.getByRole('table', { name: '/review' }))).toEqual([
      ['Release', 'Phone', 'Desktop'],
      ['0.1.9', '900 ms', '400 ms'],
      ['0.1.10', '700 ms', 'too few (n 4)'],
    ])
  })

  // Releases are this chart's axis, so choosing one would leave a single point.
  it("says the app version filter doesn't apply to it", async () => {
    await renderSuspended(ReleaseTrendCard, { props: { routes: [] } })

    expect(
      screen.getByText(
        "The app version filter doesn't apply here: releases are these charts' axis.",
      ),
    ).toBeVisible()
  })
})
