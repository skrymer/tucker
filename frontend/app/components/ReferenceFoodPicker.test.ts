import { describe, expect, it, vi } from 'vitest'
import { registerEndpoint, renderSuspended } from '@nuxt/test-utils/runtime'
import { getQuery, setResponseStatus } from 'h3'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import {
  referenceFoodCandidate,
  referenceFoodSearch,
} from '~~/test/micronutrient-fixtures'
import ReferenceFoodPicker from './ReferenceFoodPicker.vue'

const chicken = { id: 1, name: 'Chicken breast', referenceFoodName: null }

describe('ReferenceFoodPicker', () => {
  it("searches for the Food's own name as soon as it opens", async () => {
    registerEndpoint('/api/reference-foods', () =>
      referenceFoodSearch({
        suggestedId: 101,
        candidates: [
          referenceFoodCandidate({
            id: 101,
            name: 'Chicken, breast, lean flesh, raw',
          }),
        ],
      }),
    )

    await renderSuspended(ReferenceFoodPicker, { props: { food: chicken } })

    expect(
      await screen.findByText('Chicken, breast, lean flesh, raw'),
    ).toBeVisible()
  })

  it('shows the figures that tell the candidates apart, under each name', async () => {
    registerEndpoint('/api/reference-foods', () =>
      referenceFoodSearch({
        candidates: [
          referenceFoodCandidate({
            id: 101,
            name: 'Chicken, breast, lean flesh, raw',
            distinguishing: [
              { nutrient: 'IRON', label: 'Iron', unit: 'mg', amount: 0.4 },
              { nutrient: 'ZINC', label: 'Zinc', unit: 'mg', amount: 0.8 },
            ],
          }),
        ],
      }),
    )

    await renderSuspended(ReferenceFoodPicker, { props: { food: chicken } })

    // Raw against roasted moves iron and zinc materially, and a name alone gives
    // a User nothing to choose between forty near-identical entries on.
    expect(await screen.findByText('Iron 0.4 mg · Zinc 0.8 mg')).toBeVisible()
  })

  it('claims the match for the candidate the user taps', async () => {
    registerEndpoint('/api/reference-foods', () =>
      referenceFoodSearch({
        candidates: [
          referenceFoodCandidate({ id: 101, name: 'Chicken, breast, raw' }),
          referenceFoodCandidate({ id: 202, name: 'Chicken, breast, roasted' }),
        ],
      }),
    )
    const onMatch = vi.fn()
    await renderSuspended(ReferenceFoodPicker, {
      props: { food: chicken, onMatch },
    })

    await userEvent.setup().click(
      await screen.findByRole('button', {
        name: /Chicken, breast, roasted/,
      }),
    )

    expect(onMatch).toHaveBeenCalledWith(202)
  })

  it('lets a matched Food take its borrow back, naming what it borrows now', async () => {
    registerEndpoint('/api/reference-foods', () => referenceFoodSearch())
    const onUnmatch = vi.fn()
    await renderSuspended(ReferenceFoodPicker, {
      props: {
        food: {
          id: 1,
          name: 'Tasty cheese',
          referenceFoodName: 'Cheese, cheddar, natural, regular fat',
        },
        onUnmatch,
      },
    })

    // A wrong match is worse than none, which is why it is confirmed by a human
    // and why taking it back has to be as easy as making it (ADR 0027).
    expect(
      screen.getByText(/Cheese, cheddar, natural, regular fat/),
    ).toBeVisible()
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Unmatch' }))

    expect(onUnmatch).toHaveBeenCalled()
  })

  it('closes when dismissed, leaving the Food as it was', async () => {
    registerEndpoint('/api/reference-foods', () => referenceFoodSearch())
    const onClose = vi.fn()
    const onMatch = vi.fn()
    await renderSuspended(ReferenceFoodPicker, {
      props: { food: chicken, onClose, onMatch },
    })

    await userEvent.setup().click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalled()
    expect(onMatch).not.toHaveBeenCalled()
  })

  it('clears the seeded query in one tap, so a different food can be searched for', async () => {
    registerEndpoint('/api/reference-foods', () => referenceFoodSearch())
    await renderSuspended(ReferenceFoodPicker, { props: { food: chicken } })
    const box = screen.getByRole('textbox', {
      name: 'Search the food database',
    })
    expect(box).toHaveValue('Chicken breast')

    // The box opens holding the Food's own name, so on a phone every other search
    // starts with fourteen backspaces unless there is one tap that empties it.
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Clear search' }))

    expect(box).toHaveValue('')
  })

  it('shows nothing of the last Food while the next one is still searching', async () => {
    // Chicken answers at once; rice is held, so the assertions below sit in the
    // window between opening the next queue row and its answer arriving.
    let releaseRice!: () => void
    registerEndpoint('/api/reference-foods', async (event) => {
      if (String(getQuery(event).q) === 'Chicken breast')
        return referenceFoodSearch()
      await new Promise<void>((resolve) => {
        releaseRice = resolve
      })
      return referenceFoodSearch({
        suggestedId: 303,
        candidates: [referenceFoodCandidate({ id: 303, name: 'Rice, white' })],
      })
    })

    const { rerender } = await renderSuspended(ReferenceFoodPicker, {
      props: { food: chicken },
    })
    expect(
      await screen.findByText('Chicken, breast, lean flesh, raw'),
    ).toBeVisible()

    // The queue's next row — the picker is one instance whose `food` the page
    // reassigns, so nothing remounts.
    await rerender({ food: { id: 2, name: 'Jasmine rice' } })

    // A candidate left over from the last Food is a tap that writes the wrong
    // match: the sheet says "Match Jasmine rice" and the PUT would name chicken's
    // Reference Food (ADR 0027).
    expect(
      screen.queryByText('Chicken, breast, lean flesh, raw'),
    ).not.toBeInTheDocument()

    await vi.waitFor(() => expect(releaseRice).toBeTypeOf('function'))
    releaseRice()
    expect(await screen.findByText('Rice, white')).toBeVisible()
  })

  it('stays quiet about not being sure when it has offered a candidate', async () => {
    registerEndpoint('/api/reference-foods', () =>
      referenceFoodSearch({ suggestedId: 101 }),
    )

    await renderSuspended(ReferenceFoodPicker, { props: { food: chicken } })

    expect(await screen.findByText('Suggested')).toBeVisible()
    // The line is about choosing between candidates Tucker will not choose
    // between; printing it over an offered one contradicts the badge beside it.
    expect(screen.queryByText(/Pick one, or search/)).not.toBeInTheDocument()
  })

  it('asks again after clearing, rather than leaving the old answer on screen', async () => {
    registerEndpoint('/api/reference-foods', (event) =>
      String(getQuery(event).q).trim() === ''
        ? referenceFoodSearch({ suggestedId: null, candidates: [] })
        : referenceFoodSearch(),
    )
    await renderSuspended(ReferenceFoodPicker, { props: { food: chicken } })
    expect(
      await screen.findByText('Chicken, breast, lean flesh, raw'),
    ).toBeVisible()

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Clear search' }))

    // An emptied box that still lists the previous food's candidates invites a
    // match against a search nobody made.
    await vi.waitFor(() =>
      expect(
        screen.queryByText('Chicken, breast, lean flesh, raw'),
      ).not.toBeInTheDocument(),
    )
    // But it does not claim the database holds nothing like it: no search was
    // made, so neither line is an honest thing to print.
    expect(
      screen.queryByText('No match in the Australian food database.'),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/Pick one, or search/)).not.toBeInTheDocument()
  })

  it('leaves the caret in the box after clearing, ready for what comes next', async () => {
    registerEndpoint('/api/reference-foods', () => referenceFoodSearch())
    await renderSuspended(ReferenceFoodPicker, { props: { food: chicken } })

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Clear search' }))

    // Clearing is what somebody does when they mean to type. Without this the ×
    // vanishes from under the finger holding focus, and the next keystrokes go
    // nowhere — two more taps on a phone.
    expect(
      screen.getByRole('textbox', { name: 'Search the food database' }),
    ).toHaveFocus()
  })

  it('surfaces a retryable error in place when the search itself fails', async () => {
    // Held failing rather than counted down: ofetch retries a 500 GET by itself,
    // so failing "the first call" heals before the component ever sees an error.
    let failing = true
    registerEndpoint('/api/reference-foods', (event) => {
      if (!failing) return referenceFoodSearch()
      setResponseStatus(event, 500)
      return { message: 'boom' }
    })

    await renderSuspended(ReferenceFoodPicker, { props: { food: chicken } })

    // In place rather than as a toast: this is a read, and the sheet has room to
    // say so where it would have shown the answer (ADR 0005).
    expect(
      await screen.findByText("Couldn't search the food database"),
    ).toBeVisible()

    failing = false
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))

    expect(
      await screen.findByText('Chicken, breast, lean flesh, raw'),
    ).toBeVisible()
  })

  it('says the database holds nothing like it rather than showing an empty list', async () => {
    registerEndpoint('/api/reference-foods', () =>
      referenceFoodSearch({ suggestedId: null, candidates: [] }),
    )

    await renderSuspended(ReferenceFoodPicker, { props: { food: chicken } })

    // The corpus is generic staples rather than a retail catalogue, so its
    // coverage ceiling is real and an empty answer is the honest one (ADR 0027).
    expect(
      await screen.findByText('No match in the Australian food database.'),
    ).toBeVisible()
    // And never the withheld-suggestion line, which is about choosing between
    // candidates there aren't any of.
    expect(screen.queryByText(/Pick one, or search/)).not.toBeInTheDocument()
  })

  it('searches again for what the user types instead', async () => {
    registerEndpoint('/api/reference-foods', (event) =>
      getQuery(event).q === 'Chicken breast'
        ? referenceFoodSearch({
            candidates: [
              referenceFoodCandidate({ id: 101, name: 'Chicken, breast, raw' }),
            ],
          })
        : referenceFoodSearch({
            candidates: [
              referenceFoodCandidate({ id: 303, name: 'Turkey, breast, raw' }),
            ],
          }),
    )
    await renderSuspended(ReferenceFoodPicker, { props: { food: chicken } })
    expect(await screen.findByText('Chicken, breast, raw')).toBeVisible()

    const box = screen.getByRole('textbox', {
      name: 'Search the food database',
    })
    await userEvent.setup().clear(box)
    await userEvent.setup().type(box, 'Turkey')

    expect(await screen.findByText('Turkey, breast, raw')).toBeVisible()
  })

  it('says it will not guess when no candidate is confident enough, and still lists them', async () => {
    registerEndpoint('/api/reference-foods', () =>
      referenceFoodSearch({
        suggestedId: null,
        candidates: [
          referenceFoodCandidate({ id: 101, name: 'Almond beverage, plain' }),
        ],
      }),
    )

    await renderSuspended(ReferenceFoodPicker, { props: { food: chicken } })

    // No suggestion is better than a wrong one — a confidently wrong top hit is
    // this feature's characteristic failure (ADR 0027) — so the picker says so
    // and hands the User the search box instead.
    expect(
      await screen.findByText(
        "Tucker isn't sure which of these it is. Pick one, or search for something else.",
      ),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: /Almond beverage, plain/ }),
    ).toBeVisible()
  })

  it('marks the one candidate it is confident enough to offer', async () => {
    registerEndpoint('/api/reference-foods', () =>
      referenceFoodSearch({
        suggestedId: 202,
        candidates: [
          referenceFoodCandidate({ id: 101, name: 'Chicken, breast, raw' }),
          referenceFoodCandidate({ id: 202, name: 'Chicken, breast, roasted' }),
        ],
      }),
    )

    await renderSuspended(ReferenceFoodPicker, { props: { food: chicken } })

    const offered = await screen.findByRole('button', {
      name: /Chicken, breast, roasted/,
    })
    expect(offered).toHaveTextContent('Suggested')
    expect(
      screen.getByRole('button', { name: /Chicken, breast, raw/ }),
    ).not.toHaveTextContent('Suggested')
  })
})
