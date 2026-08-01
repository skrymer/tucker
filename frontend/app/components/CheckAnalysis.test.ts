import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import type { components } from '#open-fetch-schemas/api'
import { nutellaCheck } from '~~/test/check-fixtures'
import CheckAnalysis from './CheckAnalysis.vue'

type CheckResult = components['schemas']['CheckResponse']

/**
 * Dial the portion the way a user does — the slider takes the keyboard, 5 g a
 * press. Steps from wherever the thumb currently sits, so a test can walk it to
 * both ends of the track in one go.
 */
async function dialPortionTo(
  user: ReturnType<typeof userEvent.setup>,
  grams: number,
) {
  const slider = screen.getByRole('slider')
  slider.focus()
  const presses = (grams - Number(slider.getAttribute('aria-valuenow'))) / 5
  if (presses !== 0) {
    await user.keyboard(
      `{${presses > 0 ? 'ArrowRight' : 'ArrowLeft'}>${Math.abs(presses)}/}`,
    )
  }
  expect(slider).toHaveAttribute('aria-valuenow', String(grams))
}

describe('CheckAnalysis', () => {
  it('opens at a 100 g portion', async () => {
    await renderSuspended(CheckAnalysis, { props: { check: nutellaCheck } })

    expect(screen.getByText('Portion')).toBeVisible()
    expect(screen.getByText('100 g')).toBeVisible()
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '100')
  })

  it('scales what the portion costs as the portion is dialled up', async () => {
    const user = userEvent.setup()
    await renderSuspended(CheckAnalysis, { props: { check: nutellaCheck } })

    await dialPortionTo(user, 200)

    expect(screen.getByText('200 g')).toBeVisible()
    expect(screen.getByText('43%')).toBeVisible()
    expect(screen.getByText('1067 / 2492 kcal')).toBeVisible()
  })

  it('scales what the portion returns as the portion is dialled up', async () => {
    const user = userEvent.setup()
    await renderSuspended(CheckAnalysis, { props: { check: nutellaCheck } })

    await dialPortionTo(user, 200)

    expect(screen.getByText('7%')).toBeVisible()
    expect(screen.getByText('12.6 / 170 g protein')).toBeVisible()
  })

  it('returns to a 100 g portion when a new product is checked', async () => {
    // A portion is dialled for the product in the user's hand, so it must not
    // carry over to the next thing they scan.
    const user = userEvent.setup()
    const { rerender } = await renderSuspended(CheckAnalysis, {
      props: { check: nutellaCheck },
    })
    await dialPortionTo(user, 200)

    await rerender({
      check: {
        ...nutellaCheck,
        name: 'Tuna',
        caloriesPer100g: 146,
        costSharePer100g: 0.059,
      },
    })

    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '100')
    expect(screen.getByText('100 g')).toBeVisible()
    expect(screen.getByText('146 / 2492 kcal')).toBeVisible()
  })

  it('states the true share when a portion costs more than the whole budget', async () => {
    // Dialling up to 250 g makes an over-budget share ordinary rather than
    // exotic — 250 g of oil against a deficit budget is a real thing to scan.
    // The arc is capped at a full circle on purpose (ringFraction: an
    // over-target reading is a full ring, never an overshoot), so the figures
    // carry the overflow: the percentage keeps counting past 100 and the pair
    // beneath it names the excess outright. Capping the number instead would
    // report 100% for a portion costing half as much again as the day.
    const user = userEvent.setup()
    const oil: CheckResult = {
      ...nutellaCheck,
      name: 'Olive oil',
      caloriesPer100g: 884,
      calorieBudgetKcal: 1600,
      costSharePer100g: 0.5525,
    }
    const { container } = await renderSuspended(CheckAnalysis, {
      props: { check: oil },
    })

    await dialPortionTo(user, 250)

    expect(screen.getByText('138%')).toBeVisible()
    expect(screen.getByText('2210 / 1600 kcal')).toBeVisible()
    const costArc = container.querySelector('circle[stroke-linecap]')
    expect(Number(costArc!.getAttribute('stroke-dashoffset'))).toBe(0)
  })

  it('states what 100 g costs as a share of the calorie budget', async () => {
    await renderSuspended(CheckAnalysis, { props: { check: nutellaCheck } })

    expect(screen.getByText('Costs')).toBeVisible()
    expect(screen.getByText('21%')).toBeVisible()
    expect(screen.getByText('533 / 2492 kcal')).toBeVisible()
  })

  it('states what 100 g returns as a share of the protein floor', async () => {
    await renderSuspended(CheckAnalysis, { props: { check: nutellaCheck } })

    expect(screen.getByText('Returns')).toBeVisible()
    expect(screen.getByText('4%')).toBeVisible()
    expect(screen.getByText('6.3 / 170 g protein')).toBeVisible()
  })

  it('sets the food’s protein per 100 kcal against the pace the day needs', async () => {
    await renderSuspended(CheckAnalysis, { props: { check: nutellaCheck } })

    expect(screen.getByText('1.2 g protein per 100 kcal')).toBeVisible()
    expect(screen.getByText('your day needs 6.8')).toBeVisible()
  })

  it('says how much protein elsewhere would balance a food below pace', async () => {
    await renderSuspended(CheckAnalysis, { props: { check: nutellaCheck } })

    expect(
      screen.getByText('Balance 100 g with 30.1 g of protein elsewhere today.'),
    ).toBeVisible()
  })

  it('scales the protein owed elsewhere as the portion is dialled up', async () => {
    const user = userEvent.setup()
    await renderSuspended(CheckAnalysis, { props: { check: nutellaCheck } })

    await dialPortionTo(user, 200)

    expect(
      screen.getByText('Balance 200 g with 60.2 g of protein elsewhere today.'),
    ).toBeVisible()
  })

  it('never asks a below-pace food for zero grams at the smallest portion', async () => {
    // Sliding changes how much of the day a food takes, never what kind of food
    // it is (ADR 0022). A food below pace stays below pace at 10 g, and a
    // sentence asking to balance it "with 0 g" would contradict its own claim.
    const user = userEvent.setup()
    const barelyBehind: CheckResult = {
      ...nutellaCheck,
      name: 'Skyr',
      proteinPer100Kcal: 6.7,
      balanceProteinPer100gG: 0.4,
    }
    await renderSuspended(CheckAnalysis, { props: { check: barelyBehind } })

    await dialPortionTo(user, 10)

    expect(
      screen.getByText(
        'Balance 10 g with under 0.1 g of protein elsewhere today.',
      ),
    ).toBeVisible()
    expect(screen.queryByText('Keeps pace on its own.')).not.toBeInTheDocument()
  })

  it('says a food at or above pace needs nothing balanced', async () => {
    const tuna: CheckResult = {
      ...nutellaCheck,
      name: 'Tuna',
      caloriesPer100g: 146,
      proteinPer100g: 26,
      proteinPer100Kcal: 17.8,
      balanceProteinPer100gG: 0,
    }

    await renderSuspended(CheckAnalysis, { props: { check: tuna } })

    expect(screen.getByText('Keeps pace on its own.')).toBeVisible()
    expect(screen.queryByText(/^Balance 100 g/)).not.toBeInTheDocument()
  })

  it('holds pace, the food’s ratio and the day’s allowance still at every portion', async () => {
    // Cost and return both scale with grams, so their ratio cancels grams
    // entirely (ADR 0022): the dial changes how much of the day a food takes,
    // never what kind of food it is. These three lines are that claim on screen,
    // and they have to read identically at both ends of the track — the small
    // end especially, where the arcs shrink to slivers and stop communicating.
    const user = userEvent.setup()
    await renderSuspended(CheckAnalysis, { props: { check: nutellaCheck } })

    const character = () => {
      expect(screen.getByText('1.2 g protein per 100 kcal')).toBeVisible()
      expect(screen.getByText('your day needs 6.8')).toBeVisible()
      expect(
        screen.getByText(
          'A whole day of it is 467 g — and still 141 g under your protein floor.',
        ),
      ).toBeVisible()
    }

    character()
    await dialPortionTo(user, 250)
    character()
    await dialPortionTo(user, 10)
    character()
    expect(screen.getByText('0.6 / 170 g protein')).toBeVisible()
  })

  it('states how much fits a whole day and what that still leaves owing', async () => {
    await renderSuspended(CheckAnalysis, { props: { check: nutellaCheck } })

    expect(
      screen.getByText(
        'A whole day of it is 467 g — and still 141 g under your protein floor.',
      ),
    ).toBeVisible()
  })

  it('shows all three macros without judging any of them', async () => {
    await renderSuspended(CheckAnalysis, { props: { check: nutellaCheck } })

    expect(screen.getByText('6.3 g protein')).toBeVisible()
    expect(screen.getByText('57.5 g carbs')).toBeVisible()
    expect(screen.getByText('30.9 g fat')).toBeVisible()
  })

  it('restates the macro grams at the portion without redrawing the composition', async () => {
    const user = userEvent.setup()
    const { container } = await renderSuspended(CheckAnalysis, {
      props: { check: nutellaCheck },
    })
    const segments = () =>
      [...container.querySelectorAll<HTMLElement>('[style*="width"]')].map(
        (el) => el.style.width,
      )
    const composition = segments()

    await dialPortionTo(user, 200)

    expect(screen.getByText('12.6 g protein')).toBeVisible()
    expect(screen.getByText('115 g carbs')).toBeVisible()
    expect(screen.getByText('61.8 g fat')).toBeVisible()
    // Each share is of the food's own calories, so the bar's proportions are the
    // one thing on it no portion can move.
    expect(composition).toEqual(['4.7%', '43.1%', '52.1%'])
    expect(segments()).toEqual(composition)
  })

  it('credits the provider whose data the figures came from', async () => {
    // ODbL attribution is required wherever Open Food Facts data is shown
    // (ADR 0006) — these figures are theirs, not Tucker's.
    await renderSuspended(CheckAnalysis, { props: { check: nutellaCheck } })

    expect(screen.getByText('Data from Open Food Facts')).toBeVisible()
  })

  it('credits nobody for a food out of the user’s own catalog', async () => {
    const mine: CheckResult = {
      ...nutellaCheck,
      name: 'My skyr',
      source: null,
    }

    await renderSuspended(CheckAnalysis, { props: { check: mine } })

    expect(screen.queryByText(/^Data from/)).not.toBeInTheDocument()
  })

  it('draws each arc swept to its own share, not a full ring', async () => {
    // The two arcs are the argument the screen makes (frontend/DESIGN.md), and
    // they are aria-hidden — so no text assertion or aria snapshot can catch a
    // dash pattern that silently renders every product as a full circle.
    const { container } = await renderSuspended(CheckAnalysis, {
      props: { check: nutellaCheck },
    })

    const circumference = 2 * Math.PI * 72
    const arcs = [...container.querySelectorAll('circle[stroke-linecap]')]
    expect(arcs).toHaveLength(2)
    for (const arc of arcs) {
      expect(Number(arc.getAttribute('stroke-dasharray'))).toBeCloseTo(
        circumference,
        3,
      )
    }
    // 21% of the budget leaves 79% of the circle unswept; 4% of the floor, 96%.
    expect(Number(arcs[0]!.getAttribute('stroke-dashoffset'))).toBeCloseTo(
      circumference * (1 - 0.214),
      3,
    )
    expect(Number(arcs[1]!.getAttribute('stroke-dashoffset'))).toBeCloseTo(
      circumference * (1 - 0.037),
      3,
    )
  })

  it('says a macro is unknown rather than reporting it as zero', async () => {
    // A catalog Food can carry no carb figure at all — absent is never zero
    // (ADR 0006), and "0 g carbs" would be a claim the source never made.
    const partial: CheckResult = {
      ...nutellaCheck,
      carbsPer100g: null,
      carbsEnergyShare: null,
    }

    await renderSuspended(CheckAnalysis, { props: { check: partial } })

    expect(screen.getByText('carbs unknown')).toBeVisible()
    expect(screen.queryByText('0 g carbs')).not.toBeInTheDocument()
    expect(screen.getByText('6.3 g protein')).toBeVisible()
  })

  it('states a calorie-free product without an undefined ratio or allowance', async () => {
    const dietDrink: CheckResult = {
      ...nutellaCheck,
      name: 'Cola Zero',
      caloriesPer100g: 0,
      proteinPer100g: 0,
      carbsPer100g: 0,
      fatPer100g: 0,
      costSharePer100g: 0,
      returnSharePer100g: 0,
      proteinPer100Kcal: null,
      balanceProteinPer100gG: 0,
      gramsInBudget: null,
      wholeDayProteinShortfallG: null,
      proteinEnergyShare: null,
      carbsEnergyShare: null,
      fatEnergyShare: null,
    }

    await renderSuspended(CheckAnalysis, { props: { check: dietDrink } })

    expect(screen.getAllByText('0%')).toHaveLength(2)
    // With no calories there is no ratio to set against pace, so the comparison
    // is withheld rather than left dangling with nothing to compare.
    expect(screen.queryByText(/per 100 kcal/)).not.toBeInTheDocument()
    expect(screen.queryByText(/your day needs/)).not.toBeInTheDocument()
    // …and the conclusion drawn from that comparison goes with it, rather than
    // commending a product Tucker just declined to measure.
    expect(screen.queryByText('Keeps pace on its own.')).not.toBeInTheDocument()
    expect(screen.queryByText(/A whole day of it/)).not.toBeInTheDocument()
    expect(
      screen.queryByText(/NaN|Infinity|undefined|null/),
    ).not.toBeInTheDocument()
  })
})
