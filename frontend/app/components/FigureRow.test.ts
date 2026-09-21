import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import FigureRow from './FigureRow.vue'

describe('FigureRow', () => {
  it('states the name above the figures it cost and returned', async () => {
    await renderSuspended(FigureRow, {
      props: { name: 'Strawberry', figures: '35 kcal · 0 g protein' },
    })

    expect(screen.getByText('Strawberry')).toBeVisible()
    expect(screen.getByText('35 kcal · 0 g protein')).toBeVisible()
  })

  it('states the name in sentence case, so no caller has to remember to', async () => {
    await renderSuspended(FigureRow, {
      props: { name: 'LIGHT MILK', figures: '240 kcal · 8 g protein' },
    })

    expect(screen.getByText('Light milk')).toBeVisible()
  })

  it('carries a marker on the name’s own line, never down among the figures', async () => {
    await renderSuspended(FigureRow, {
      props: { name: 'Cafe lunch', figures: '600 kcal' },
      slots: { marker: '<span>est.</span>' },
    })

    // A marker qualifies the thing, so it reads with the name rather than with
    // what the thing cost.
    const name = screen.getByText('Cafe lunch')
    expect(name.parentElement).toHaveTextContent('est.')
    expect(screen.getByText('600 kcal')).not.toHaveTextContent('est.')
  })

  it('leads the name with whatever identifies it, such as a ring’s own hue', async () => {
    await renderSuspended(FigureRow, {
      props: { name: 'Strawberry', figures: '35 kcal · 0 g protein' },
      slots: { lead: '<i data-testid="swatch" />' },
    })

    const name = screen.getByText('Strawberry')
    expect(name.parentElement).toContainElement(screen.getByTestId('swatch'))
  })

  it('carries further lines beneath the figures, where a row says more', async () => {
    await renderSuspended(FigureRow, {
      props: { name: 'Cottage pie', figures: '255 kcal · 30 g protein /100g' },
      slots: { default: '<span>5 ingredients · makes 1,400 g</span>' },
    })

    expect(screen.getByText('5 ingredients · makes 1,400 g')).toBeVisible()
  })
})
