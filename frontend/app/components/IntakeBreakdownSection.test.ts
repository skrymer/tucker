import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { OTHER_COLOR, RING_SLOT_COLORS } from '~/utils/intakeBreakdown'
import IntakeBreakdownSection from './IntakeBreakdownSection.vue'
import {
  breakdownItem,
  intakeBreakdown,
} from '~~/test/intake-breakdown-fixtures'

describe('IntakeBreakdownSection', () => {
  /**
   * Eight slices that fill the palette, plus a tail that folds into Other. The
   * tail is the part each test cares about, so it is the part each test states.
   */
  function aFoldingDay(
    tail: Parameters<typeof breakdownItem>[0][] = [
      {
        foodId: null,
        name: 'Ninth',
        calories: 120,
        protein: null,
        share: 0.12,
        isEstimate: true,
      },
      { name: 'Tenth', calories: 80, protein: 4, share: 0.08 },
    ],
  ) {
    return intakeBreakdown({
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
        ...tail.map((overrides) => breakdownItem(overrides)),
      ],
    })
  }

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
        breakdown: aFoldingDay([
          { name: 'Ninth', calories: 120, protein: 6, share: 0.12 },
          { name: 'Tenth', calories: 80, protein: 4, share: 0.08 },
        ]),
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

  it('offers the day and the week, marking the period being shown', async () => {
    await renderSuspended(IntakeBreakdownSection, {
      props: { breakdown: intakeBreakdown(), period: 'week' },
    })

    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName(
      'Last 7 days',
    )
    expect(screen.getByRole('tab', { name: 'Today' })).toBeVisible()
  })

  it('names the toggle, so a tab is not offered with no clue what it switches', async () => {
    await renderSuspended(IntakeBreakdownSection, {
      props: { breakdown: intakeBreakdown(), period: 'today' },
    })

    expect(
      within(screen.getByRole('group', { name: 'Period' })).getAllByRole('tab'),
    ).toHaveLength(2)
  })

  it('hands the chosen period to the page, which is what asks for the window', async () => {
    const user = userEvent.setup()
    const chosen = vi.fn()
    await renderSuspended(IntakeBreakdownSection, {
      props: {
        breakdown: intakeBreakdown(),
        period: 'today',
        'onUpdate:period': chosen,
      },
    })

    await user.click(screen.getByRole('tab', { name: 'Last 7 days' }))

    expect(chosen).toHaveBeenCalledWith('week')
  })

  it("states how many of the window's days carry an Entry, so a thin week is discounted", async () => {
    await renderSuspended(IntakeBreakdownSection, {
      props: {
        breakdown: intakeBreakdown({
          from: '2026-08-21',
          to: '2026-08-27',
          loggedDays: 5,
        }),
        period: 'week',
      },
    })

    expect(screen.getByText('5 of 7 days logged')).toBeVisible()
  })

  it('says nothing about coverage for a single day, whose count could only be none or all', async () => {
    await renderSuspended(IntakeBreakdownSection, {
      props: {
        breakdown: intakeBreakdown({
          from: '2026-08-27',
          to: '2026-08-27',
          loggedDays: 1,
        }),
        period: 'today',
      },
    })

    expect(screen.queryByText(/days logged/)).not.toBeInTheDocument()
  })

  it('opens Other onto the Foods it folded, each stating its own figures', async () => {
    const user = userEvent.setup()
    await renderSuspended(IntakeBreakdownSection, {
      props: { breakdown: aFoldingDay() },
    })

    expect(screen.queryByText('Tenth')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show all 2' }))

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(11)
    expect(rows[9]).toHaveTextContent('Ninth')
    expect(rows[9]).toHaveTextContent('120 kcal')
    expect(rows[9]).toHaveTextContent('12%')
    expect(rows[10]).toHaveTextContent('Tenth')
    expect(rows[10]).toHaveTextContent('80 kcal · 4 g protein')
    expect(rows[10]).toHaveTextContent('8%')
  })

  it('closes Other again, rather than only ever opening', async () => {
    const user = userEvent.setup()
    await renderSuspended(IntakeBreakdownSection, {
      props: { breakdown: aFoldingDay() },
    })

    await user.click(screen.getByRole('button', { name: 'Show all 2' }))
    await user.click(screen.getByRole('button', { name: 'Show less' }))

    expect(screen.getAllByRole('listitem')).toHaveLength(9)
    expect(screen.queryByText('Tenth')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show all 2' })).toBeVisible()
  })

  it('keeps a revealed estimate flagged, and still omits protein it has no figure for', async () => {
    const user = userEvent.setup()
    await renderSuspended(IntakeBreakdownSection, {
      props: { breakdown: aFoldingDay() },
    })

    await user.click(screen.getByRole('button', { name: 'Show all 2' }))

    const [ninth, tenth] = screen.getAllByRole('listitem').slice(-2)
    expect(ninth).toHaveTextContent('est.')
    expect(ninth).toHaveTextContent('120 kcal')
    expect(ninth).not.toHaveTextContent('protein')
    expect(tenth).not.toHaveTextContent('est.')
  })

  it('folds Other back up when a new window lands, so it opens the way its ring drew', async () => {
    const user = userEvent.setup()
    const { rerender } = await renderSuspended(IntakeBreakdownSection, {
      props: { breakdown: aFoldingDay(), period: 'today' },
    })

    await user.click(screen.getByRole('button', { name: 'Show all 2' }))
    await rerender({
      breakdown: {
        ...aFoldingDay(),
        from: '2026-08-21',
        to: '2026-08-27',
        loggedDays: 5,
      },
      period: 'week',
    })

    expect(screen.getByRole('button', { name: 'Show all 2' })).toBeVisible()
    expect(screen.queryByText('Tenth')).not.toBeInTheDocument()
  })

  it('leaves an opened tail open when the same window is simply loaded again', async () => {
    const user = userEvent.setup()
    const { rerender } = await renderSuspended(IntakeBreakdownSection, {
      props: { breakdown: aFoldingDay(), period: 'today' },
    })

    await user.click(screen.getByRole('button', { name: 'Show all 2' }))
    // A retry answers the question already on screen, so nothing the User did to
    // that answer is undone.
    await rerender({ breakdown: aFoldingDay(), period: 'today' })

    expect(screen.getByText('Tenth')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Show less' })).toBeVisible()
  })

  it('measures coverage from the window it was given, not from the period selected', async () => {
    // The two disagree for the length of a round-trip. Reading the period would
    // put the week's width over the day's count — a confident wrong figure in
    // exactly the window the caption exists to qualify.
    await renderSuspended(IntakeBreakdownSection, {
      props: {
        breakdown: intakeBreakdown({
          from: '2026-08-27',
          to: '2026-08-27',
          loggedDays: 1,
        }),
        period: 'week',
      },
    })

    expect(screen.queryByText(/days logged/)).not.toBeInTheDocument()
  })

  it('holds the tail open while the window it belongs to is still on screen', async () => {
    const user = userEvent.setup()
    const { rerender } = await renderSuspended(IntakeBreakdownSection, {
      props: { breakdown: aFoldingDay(), period: 'today' },
    })

    await user.click(screen.getByRole('button', { name: 'Show all 2' }))
    // The period has been chosen but its answer has not landed, so the rows below
    // are still the previous window's and folding them now would be a flinch.
    await rerender({ breakdown: aFoldingDay(), period: 'week' })

    expect(screen.getByText('Tenth')).toBeVisible()
  })

  it('says a wider window is on its way rather than letting the day be read as it', async () => {
    await renderSuspended(IntakeBreakdownSection, {
      props: { breakdown: aFoldingDay(), period: 'week', pending: true },
    })

    expect(
      screen.getByRole('region', { name: "What you're eating" }),
    ).toHaveAttribute('aria-busy', 'true')
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
    // The toggle survives an empty window, so a User whose today is blank can
    // still ask about their week.
    expect(screen.getByRole('tab', { name: 'Last 7 days' })).toBeVisible()
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
        breakdown: aFoldingDay([
          { name: 'Ninth', calories: 120, share: 0.12 },
          { name: 'Tenth', calories: 80, share: 0.08 },
        ]),
      },
      global: {
        stubs: {
          DonutChart: defineComponent({
            props: {
              data: { type: Array, default: () => [] },
              categories: { type: Object, default: () => ({}) },
            },
            // Captured on every render, not once in `setup`: the regression this
            // guards is the ring being fed the *revealed* rows, which only shows
            // up on a re-render after Other is opened.
            setup: (props) => () => {
              seen = { data: props.data, categories: props.categories }
              return h('div')
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

    // Opening Other reveals rows the ring has no hue for, so the arcs must not
    // follow them: eleven arcs, three of them colourless, is what fed the ring
    // from the legend's visible rows would draw.
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Show all 2' }))

    expect(seen.data).toEqual([100, 100, 100, 100, 100, 100, 100, 100, 200])
  })

  it('counts the one Food it folded in the singular', async () => {
    // Exactly nine slices is an ordinary day, and the only case where Other
    // stands for a single Food.
    await renderSuspended(IntakeBreakdownSection, {
      props: {
        breakdown: aFoldingDay([{ name: 'Ninth', calories: 50 }]),
      },
    })

    const other = screen.getAllByRole('listitem').at(-1)!
    expect(other).toHaveTextContent('1 item')
    expect(other).not.toHaveTextContent('1 items')
  })

  it('never flags Other an estimate, whatever the tail it folded held', async () => {
    await renderSuspended(IntakeBreakdownSection, {
      props: {
        // The whole tail is estimated, and Other still is not: it stands for
        // several Foods at once, so a flag on it would say something about all
        // of them.
        breakdown: aFoldingDay([
          { foodId: null, name: 'Ninth', calories: 50, isEstimate: true },
          { foodId: null, name: 'Tenth', calories: 40, isEstimate: true },
        ]),
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
