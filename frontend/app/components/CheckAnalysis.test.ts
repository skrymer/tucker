import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import type { components } from '#open-fetch-schemas/api'
import { nutellaCheck } from '~~/test/check-fixtures'
import CheckAnalysis from './CheckAnalysis.vue'

type CheckResult = components['schemas']['CheckResponse']

describe('CheckAnalysis', () => {
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
      screen.getByText('Balance 100 g with 30 g of protein elsewhere today.'),
    ).toBeVisible()
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

  it('credits the provider whose data the figures came from', async () => {
    // ODbL attribution is required wherever Open Food Facts data is shown
    // (ADR 0006) — these figures are theirs, not Tucker's.
    await renderSuspended(CheckAnalysis, { props: { check: nutellaCheck } })

    expect(screen.getByText('Data from Open Food Facts')).toBeVisible()
  })

  it('credits nobody for a food out of the user’s own catalog', async () => {
    const mine: CheckResult = { ...nutellaCheck, name: 'My skyr', source: null }

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
