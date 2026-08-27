import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import IntakeBreakdownSection from './IntakeBreakdownSection.vue'
import {
  breakdownItem,
  intakeBreakdown,
} from '~~/test/intake-breakdown-fixtures'

describe('IntakeBreakdownSection', () => {
  it('gives every slice a legend row stating what it cost and what it returned', async () => {
    await renderSuspended(IntakeBreakdownSection, {
      props: {
        breakdown: intakeBreakdown({
          totalCalories: 1160,
          // Ranked by the backend, biggest first — the order the section keeps.
          items: [
            breakdownItem({
              foodId: 7,
              name: 'Basmati rice',
              calories: 640,
              protein: 13,
              share: 0.5517,
            }),
            breakdownItem({
              name: 'Chicken breast',
              calories: 520,
              protein: 97,
              share: 0.4483,
            }),
          ],
        }),
      },
    })

    // Biggest first, as the backend ranked them.
    const [rice, chicken] = screen.getAllByRole('listitem')

    expect(rice).toHaveTextContent('Basmati rice')
    expect(rice).toHaveTextContent('640 kcal · 13 g protein')
    expect(rice).toHaveTextContent('55%')

    expect(chicken).toHaveTextContent('Chicken breast')
    expect(chicken).toHaveTextContent('520 kcal · 97 g protein')
    expect(chicken).toHaveTextContent('45%')
  })

  it('flags a slice that came from an estimate, and leaves a weighed one unflagged', async () => {
    await renderSuspended(IntakeBreakdownSection, {
      props: {
        breakdown: intakeBreakdown({
          items: [
            breakdownItem({
              foodId: null,
              name: 'Work canteen',
              isEstimate: true,
            }),
            breakdownItem({ name: 'Chicken breast' }),
          ],
        }),
      },
    })

    const [canteen, chicken] = screen.getAllByRole('listitem')
    expect(canteen).toHaveTextContent('est.')
    expect(chicken).not.toHaveTextContent('est.')
  })

  it('omits protein from a slice that has no figure, and states a known zero', async () => {
    await renderSuspended(IntakeBreakdownSection, {
      props: {
        breakdown: intakeBreakdown({
          items: [
            breakdownItem({
              name: 'Work canteen',
              calories: 640,
              protein: null,
              isEstimate: true,
            }),
            breakdownItem({ name: 'Black coffee', calories: 4, protein: 0 }),
          ],
        }),
      },
    })

    const [canteen, coffee] = screen.getAllByRole('listitem')
    expect(canteen).toHaveTextContent('640 kcal')
    expect(canteen).not.toHaveTextContent('protein')
    expect(coffee).toHaveTextContent('4 kcal · 0 g protein')
  })

  it('folds the tail past the palette into one Other row naming how many it holds', async () => {
    await renderSuspended(IntakeBreakdownSection, {
      props: {
        breakdown: intakeBreakdown({
          totalCalories: 1000,
          items: [
            ...Array.from({ length: 8 }, (_, i) =>
              breakdownItem({
                name: `Food ${i + 1}`,
                calories: 100,
                protein: 10,
                share: 0.1,
              }),
            ),
            breakdownItem({
              name: 'Ninth',
              calories: 120,
              protein: 6,
              share: 0.12,
            }),
            breakdownItem({
              name: 'Tenth',
              calories: 80,
              protein: 4,
              share: 0.08,
            }),
          ],
        }),
      },
    })

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(9)

    const other = rows.at(-1)!
    expect(other).toHaveTextContent('Other')
    expect(other).toHaveTextContent('2 items')
    expect(other).toHaveTextContent('200 kcal · 10 g protein')
    expect(other).toHaveTextContent('20%')

    // A ninth Food never gets an invented hue, so it is not on the ring by name.
    expect(screen.queryByText('Ninth')).not.toBeInTheDocument()
  })

  it('says nothing was logged rather than drawing an empty ring', async () => {
    await renderSuspended(IntakeBreakdownSection, {
      props: {
        breakdown: intakeBreakdown({
          totalCalories: 0,
          loggedDays: 0,
          items: [],
        }),
      },
    })

    expect(screen.getByText('Nothing logged yet')).toBeVisible()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('states the window total, which is the denominator every share is of', async () => {
    await renderSuspended(IntakeBreakdownSection, {
      props: { breakdown: intakeBreakdown({ totalCalories: 1935 }) },
    })

    expect(screen.getByText('1935 kcal')).toBeVisible()
  })
})
