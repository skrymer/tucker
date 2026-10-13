import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import FigureDiff from './FigureDiff.vue'

describe('FigureDiff', () => {
  it('states a figure that moved as what it was, struck through, then what it is', async () => {
    await renderSuspended(FigureDiff, {
      props: {
        before: { kcal: 900, protein: 0 },
        after: { kcal: 828, protein: 0 },
      },
    })

    // A deletion is how the strike reaches assistive technology; this
    // Testing Library's role table predates the `deletion` role.
    const was = screen.getByText('900').closest('del')
    expect(was).toHaveTextContent(/^was 900$/)
    expect(was?.parentElement).toHaveTextContent(
      /^was 900 828 kcal · 0 g protein \/100g$/,
    )
  })

  it('states a figure whose rounded value held once, unstruck, beside one that moved', async () => {
    const { container } = await renderSuspended(FigureDiff, {
      props: {
        before: { kcal: 355.4, protein: 31 },
        after: { kcal: 354.6, protein: 13 },
      },
    })

    expect(container).toHaveTextContent(
      /^355 kcal · was 31 13 g protein \/100g$/,
    )
    expect(screen.getByText('31').closest('del')).toHaveTextContent(/^was 31$/)
  })
})
