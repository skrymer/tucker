import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import {
  micronutrientIntake,
  unmatchedFood,
} from '~~/test/micronutrient-fixtures'
import MicronutrientSection from './MicronutrientSection.vue'

describe('MicronutrientSection', () => {
  it('states how much of the window can report a vitamin or mineral at all', async () => {
    await renderSuspended(MicronutrientSection, {
      props: { intake: micronutrientIntake({ coverage: 0.62 }) },
    })

    expect(
      screen.getByText(
        /62% of the last 7 days' calories came from food Tucker can read/,
      ),
    ).toBeVisible()
  })

  it('folds the queue behind one disclosure rather than listing it in the card', async () => {
    await renderSuspended(MicronutrientSection, {
      props: {
        intake: micronutrientIntake({
          unmatched: [
            unmatchedFood({ foodId: 1, name: 'Chicken breast' }),
            unmatchedFood({ foodId: 2, name: 'Jasmine rice' }),
          ],
        }),
      },
    })

    expect(
      screen.getByRole('button', { name: /2 foods to match/ }),
    ).toBeVisible()
    expect(screen.queryByText('Chicken breast')).not.toBeInTheDocument()
  })

  it('lists what is left to match with its share, once the queue is opened', async () => {
    await renderSuspended(MicronutrientSection, {
      props: {
        intake: micronutrientIntake({
          unmatched: [
            unmatchedFood({ foodId: 1, name: 'Chicken breast', share: 0.27 }),
            unmatchedFood({ foodId: 2, name: 'Jasmine rice', share: 0.11 }),
          ],
        }),
      },
    })

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /2 foods to match/ }))

    const queued = screen.getAllByRole('button', { name: /Match / })
    expect(queued.map((button) => button.textContent?.trim())).toEqual([
      expect.stringContaining('Chicken breast'),
      expect.stringContaining('Jasmine rice'),
    ])
    expect(queued[0]).toHaveTextContent('27%')
    expect(queued[1]).toHaveTextContent('11%')
  })

  it('asks to match the queued Food the user taps', async () => {
    const onMatch = vi.fn()
    const rice = unmatchedFood({ foodId: 2, name: 'Jasmine rice' })
    await renderSuspended(MicronutrientSection, {
      props: { intake: micronutrientIntake({ unmatched: [rice] }), onMatch },
    })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /1 food to match/ }))
    await user.click(screen.getByRole('button', { name: 'Match Jasmine rice' }))

    expect(onMatch).toHaveBeenCalledWith(rice)
  })

  it('carries the attribution, the data limitation and the Australian-data notice', async () => {
    await renderSuspended(MicronutrientSection, {
      props: { intake: micronutrientIntake() },
    })

    // AFCD is CC BY-SA 3.0 AU: naming the source, reproducing the Limitation of
    // Data Statement and carrying the Australian-data notice are licence terms,
    // not decoration (ADR 0027).
    expect(
      screen.getByText(/Australian Food Composition Database/),
    ).toBeVisible()
    expect(screen.getByText(/CC BY-SA 3\.0 AU/)).toBeVisible()
    expect(
      screen.getByText(
        /There are limitations associated with food composition databases\./,
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /based on Australian data and Australia data may not be appropriate for use in other countries/,
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /licence/i })).toHaveAttribute(
      'href',
      'https://www.foodstandards.gov.au/science-data/monitoringnutrients/afcd/datauserlicenceagreement',
    )
  })

  it('reports itself busy while the figures behind it are being refreshed', async () => {
    await renderSuspended(MicronutrientSection, {
      props: { intake: micronutrientIntake({ coverage: 0.62 }), pending: true },
    })

    // Keep-stale-and-dim rather than blank: a match refreshes this card, and the
    // coverage figure on screen is the one from before the match landed
    // (ADR 0007).
    expect(
      screen.getByRole('region', { name: 'Vitamins and minerals' }),
    ).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText(/62% of the last 7 days' calories/)).toBeVisible()
  })

  it('tells a window with nothing logged from one that is fully matched', async () => {
    await renderSuspended(MicronutrientSection, {
      props: {
        intake: micronutrientIntake({
          totalCalories: 0,
          coverage: 0,
          unmatched: [],
        }),
      },
    })

    expect(screen.getByText('Nothing logged in the last 7 days.')).toBeVisible()
    // A 0% coverage sentence over an empty window would be true and useless: it
    // reads as a failure to match rather than as a week with nothing in it.
    expect(
      screen.queryByText(/came from food Tucker can read/),
    ).not.toBeInTheDocument()
    // Nor "Nothing left to match", which is true of an empty week and says the
    // wrong thing about it: there was never anything to match.
    expect(screen.queryByText(/Nothing left to match/)).not.toBeInTheDocument()
  })

  it('names what the last of the window is, once nothing is left to match', async () => {
    await renderSuspended(MicronutrientSection, {
      props: {
        intake: micronutrientIntake({ coverage: 0.71, unmatched: [] }),
      },
    })

    // Full coverage is unreachable, so an unexplained 29% reads as a chore
    // undone. Once nothing is matchable the sentence names what remains and why
    // no tap will move it (ADR 0027).
    expect(
      screen.getByText(
        /Nothing left to match\. The rest came from meals you estimated and from recipes/,
      ),
    ).toBeVisible()
    // And the disclosure goes with it: an empty one is a chore on display with
    // nothing behind it.
    expect(
      screen.queryByRole('button', { name: /to match/ }),
    ).not.toBeInTheDocument()
  })
})
