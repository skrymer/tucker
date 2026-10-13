import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import Design from './design.vue'

describe('/design', () => {
  it('captions every type specimen with its role and the class that sets it', async () => {
    await renderSuspended(Design)

    for (const [role, token] of [
      ['Ring figure', 'text-ring-figure'],
      ['h1', 'text-h1'],
      ['Stat', 'text-stat'],
      ['h2', 'text-h2'],
      ['Body', 'text-body'],
      ['Label', 'text-label'],
      ['Eyebrow', 'text-eyebrow'],
    ]) {
      expect(
        screen.getByText(
          (_, el) =>
            el?.tagName === 'DD' &&
            el
              .textContent!.replace(/\s+/g, ' ')
              .startsWith(`${role} · ${token}`),
        ),
      ).toBeInTheDocument()
    }
  })

  it("states the logged-today specimen as Today does, a weighed entry's grams first", async () => {
    await renderSuspended(Design)

    const card = screen.getByText('Flat white').closest('ul')!
    const [oats, flatWhite, burger] = within(card).getAllByRole('listitem')
    expect(oats).toHaveTextContent(
      /^Rolled oats\s*80 g · 302 kcal · 11 g protein$/,
    )
    expect(flatWhite).toHaveTextContent(/^Flat white\s*est\.\s*90 kcal$/)
    expect(burger).toHaveTextContent(
      /^Kangaroo burger\s*150 g · 219 kcal · 33 g protein$/,
    )
    expect(
      within(card)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual([
      'Delete Rolled oats — 80 g · 302 kcal · 11 g protein',
      'Delete Flat white — 90 kcal',
      'Delete Kangaroo burger — 150 g · 219 kcal · 33 g protein',
    ])
  })

  it("shows a load error nested under a card's own heading, a level down", async () => {
    await renderSuspended(Design)

    const specimen = screen
      .getByRole('heading', { name: 'Feedback states', level: 2 })
      .closest('div')!
    expect(
      within(specimen).getByRole('heading', {
        name: "Couldn't load Thu 8 Oct",
        level: 3,
      }),
    ).toBeVisible()
    expect(
      within(specimen).getByRole('button', { name: 'Retry' }),
    ).toBeVisible()
  })

  it('shows a sheet stepped inside itself: Back, then its title, then Close', async () => {
    await renderSuspended(Design)

    const section = screen
      .getByRole('heading', { name: 'Sheet navigation' })
      .closest('div')!
    const header = within(section).getByRole('group', { name: 'Sheet header' })
    expect(header).toHaveTextContent(/^Back\s*Match Tasty cheese$/)
    expect(
      within(header)
        .getAllByRole('button')
        .map(
          (button) =>
            button.getAttribute('aria-label') ?? button.textContent?.trim(),
        ),
    ).toEqual(['Back', 'Close'])
  })

  it('shows the one calendar with marked days and a bounded range', async () => {
    await renderSuspended(Design)

    const calendar = screen
      .getByRole('heading', { name: 'Calendar' })
      .closest('div')!
    const day = (name: string) => within(calendar).getByRole('button', { name })
    // The dot is purely visual, so it has no accessible form to query by.
    expect(
      within(calendar)
        .getAllByRole('button', { name: /^\w+day, / })
        .filter((cell) => cell.querySelector('[data-slot="base"]'))
        .map((cell) => cell.getAttribute('aria-label')),
    ).toEqual([
      'Monday, October 5, 2026',
      'Tuesday, October 6, 2026',
      'Wednesday, October 7, 2026',
      'Friday, October 9, 2026',
    ])
    expect(day('Sunday, October 25, 2026')).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(day('Saturday, October 24, 2026')).not.toHaveAttribute(
      'aria-disabled',
    )
  })
})
