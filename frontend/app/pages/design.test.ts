import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import { markedDays } from '~~/test/calendar-marks'
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

  it('frames each specimen section as a content card, its heading in the band', async () => {
    await renderSuspended(Design)

    for (const name of [
      'Typography',
      'Signature · the Ring',
      'Cards & entries',
      'Form controls',
      'Sheet navigation',
      'Calendar',
    ]) {
      expect(
        within(screen.getByRole('region', { name })).getByRole('heading', {
          level: 2,
          name,
        }),
      ).toBeVisible()
    }
  })

  it('shows the content card with and without a trailing slot, and in each body state', async () => {
    await renderSuspended(Design)

    const section = screen
      .getByRole('heading', { name: 'Content card', level: 2 })
      .closest('div')!
    const cards = within(section).getAllByRole('region')
    expect(cards).toHaveLength(5)
    const [plain, withTally, loading, empty, failed] = cards
    expect(plain).toHaveAccessibleName("Today's weight")
    expect(plain).toHaveTextContent('84.2 kg')
    expect(withTally).toHaveTextContent('3 entries · 1,240 kcal')
    expect(loading).toHaveAttribute('aria-busy', 'true')
    expect(within(empty!).getByText(/^No budget yet/)).toBeVisible()
    expect(within(failed!).getByRole('button', { name: 'Retry' })).toBeVisible()
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

    const section = screen.getByRole('region', { name: 'Sheet navigation' })
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

  it('shows the live Day Ring under, slightly over and over budget, and the three day verdicts', async () => {
    await renderSuspended(Design)

    const ringSection = within(
      screen.getByRole('region', { name: 'Signature · the Ring' }),
    )
    expect(
      ringSection
        .getAllByText(/^kcal (left|over)$/)
        .map((label) => label.previousElementSibling!.textContent!.trim()),
    ).toEqual(['1136', '60', '360'])
    expect(
      ringSection.getAllByText(/^kcal (left|over)$/).map((l) => l.textContent),
    ).toEqual(['kcal left', 'kcal over', 'kcal over'])
    expect(
      ringSection
        .getAllByText(/^(On target|Slightly over|Over budget)$/)
        .map((pill) => pill.textContent!.trim()),
    ).toEqual(['On target', 'Slightly over', 'Over budget'])
  })

  it('shows the one calendar with both marks, their legend and a bounded range', async () => {
    await renderSuspended(Design)

    const calendar = screen.getByRole('region', { name: 'Calendar' })
    const day = (name: string) => within(calendar).getByRole('button', { name })
    expect(markedDays('weight', calendar)).toEqual([
      'Monday, October 5, 2026',
      'Tuesday, October 6, 2026',
      'Thursday, October 8, 2026',
      'Friday, October 9, 2026',
      'Sunday, October 25, 2026',
    ])
    expect(markedDays('entries', calendar)).toEqual([
      'Monday, October 5, 2026',
      'Wednesday, October 7, 2026',
      'Friday, October 9, 2026',
      'Sunday, October 25, 2026',
    ])
    expect(within(calendar).getByTestId('calendar-legend')).toHaveTextContent(
      /^Entries\s*Weight$/,
    )
    expect(day('Sunday, October 25, 2026')).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(day('Saturday, October 24, 2026')).not.toHaveAttribute(
      'aria-disabled',
    )
  })
})
