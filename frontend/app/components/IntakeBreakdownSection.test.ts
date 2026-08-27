import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import { OTHER_COLOR, RING_SLOT_COLORS } from '~/utils/intakeBreakdown'
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
          items: [],
        }),
      },
    })

    expect(screen.getByText('Nothing logged yet')).toBeVisible()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  // The ring is aria-hidden by design — three of the palette's light hues sit
  // under 3:1, so the legend beside it is what makes it readable (DESIGN.md).
  // That leaves its feed invisible to every other test in the suite: gut it and
  // the ring draws nothing while the legend still reads correctly. Asserted
  // through the chart's own props, which is the only seam it has.
  it('feeds the ring one arc per legend row, sized and coloured to match it', async () => {
    let seen: Record<string, unknown> = {}
    await renderSuspended(IntakeBreakdownSection, {
      props: {
        breakdown: intakeBreakdown({
          totalCalories: 1000,
          items: [
            ...Array.from({ length: 8 }, (_, i) =>
              breakdownItem({
                name: `Food ${i + 1}`,
                calories: 100,
                share: 0.1,
              }),
            ),
            breakdownItem({ name: 'Ninth', calories: 120, share: 0.12 }),
            breakdownItem({ name: 'Tenth', calories: 80, share: 0.08 }),
          ],
        }),
      },
      global: {
        stubs: {
          DonutChart: defineComponent({
            props: {
              data: { type: Array, default: () => [] },
              categories: { type: Object, default: () => ({}) },
            },
            setup: (props) => {
              seen = { data: props.data, categories: props.categories }
              return () => h('div')
            },
          }),
        },
      },
    })

    // Sized by calories, in the legend's order — eight Foods then the fold.
    expect(seen.data).toEqual([100, 100, 100, 100, 100, 100, 100, 100, 200])

    const categories = seen.categories as Record<
      string,
      { name: string; color: string }
    >
    expect(Object.values(categories).map((c) => c.name)).toEqual([
      'Food 1',
      'Food 2',
      'Food 3',
      'Food 4',
      'Food 5',
      'Food 6',
      'Food 7',
      'Food 8',
      'Other',
    ])
    // Each arc carries its slot's hue, and Other the de-emphasis grey — never a
    // ninth slot, and never an invented colour.
    expect(Object.values(categories).map((c) => c.color)).toEqual([
      ...RING_SLOT_COLORS,
      OTHER_COLOR,
    ])
  })

  it('counts the one Food it folded in the singular', async () => {
    // Exactly nine slices is an ordinary day, and the only case where Other
    // stands for a single Food.
    await renderSuspended(IntakeBreakdownSection, {
      props: {
        breakdown: intakeBreakdown({
          items: Array.from({ length: 9 }, (_, i) =>
            breakdownItem({ name: `Food ${i + 1}`, calories: 100 - i }),
          ),
        }),
      },
    })

    const other = screen.getAllByRole('listitem').at(-1)!
    expect(other).toHaveTextContent('1 item')
    expect(other).not.toHaveTextContent('1 items')
  })

  it('never flags Other an estimate, whatever the tail it folded held', async () => {
    await renderSuspended(IntakeBreakdownSection, {
      props: {
        breakdown: intakeBreakdown({
          items: [
            ...Array.from({ length: 8 }, (_, i) =>
              breakdownItem({ name: `Food ${i + 1}`, calories: 100 }),
            ),
            // The whole tail is estimated, and Other still is not: it stands for
            // several Foods at once, so a flag on it would say something about
            // all of them.
            breakdownItem({
              foodId: null,
              name: 'Ninth',
              calories: 50,
              isEstimate: true,
            }),
            breakdownItem({
              foodId: null,
              name: 'Tenth',
              calories: 40,
              isEstimate: true,
            }),
          ],
        }),
      },
    })

    const other = screen.getAllByRole('listitem').at(-1)!
    expect(other).toHaveTextContent('Other')
    expect(other).not.toHaveTextContent('est.')
  })

  it('states the window total, which is the denominator every share is of', async () => {
    await renderSuspended(IntakeBreakdownSection, {
      props: { breakdown: intakeBreakdown({ totalCalories: 1935 }) },
    })

    expect(screen.getByText('1935 kcal')).toBeVisible()
  })
})
