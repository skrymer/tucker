import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import {
  micronutrientIntake,
  micronutrientRow,
  unmatchedFood,
  unstatedMicronutrientRow,
} from '~~/test/micronutrient-fixtures'
import MicronutrientSection from './MicronutrientSection.vue'

describe('MicronutrientSection', () => {
  it('states how much of the window can report a vitamin or mineral at all', async () => {
    await renderSuspended(MicronutrientSection, {
      props: { intake: micronutrientIntake({ coverage: 0.62 }) },
    })

    expect(
      screen.getByText(
        /62% of the last 7 days' calories came from food Tucker can read/,
      ),
    ).toBeVisible()
  })

  it('names the window the response describes, rather than a seven of its own', async () => {
    // The seven-day rule lives in `MicronutrientIntake.of`, which is what lets
    // this card render whatever it is handed. The point is that its three day
    // counts are one number, so they cannot drift apart.
    await renderSuspended(MicronutrientSection, {
      props: {
        intake: micronutrientIntake({
          from: '2026-08-25',
          to: '2026-08-27',
          loggedDays: 2,
        }),
      },
    })

    expect(screen.getByText(/of the last 3 days' calories/)).toBeVisible()
    expect(screen.getByText('2 of 3 days logged')).toBeVisible()
  })

  it('discounts its seven-day claim by how much of the week was logged', async () => {
    await renderSuspended(MicronutrientSection, {
      props: { intake: micronutrientIntake({ loggedDays: 3 }) },
    })

    // The width of a window is no evidence it was lived in, and the sentence
    // above makes a claim about *the last 7 days* that is exactly as strong as
    // the log behind it (ADR 0026).
    expect(screen.getByText('3 of 7 days logged')).toBeVisible()
  })

  it('states a nutrient it can claim as a figure against its reference', async () => {
    await renderSuspended(MicronutrientSection, {
      props: {
        intake: micronutrientIntake({
          rows: [
            micronutrientRow({
              label: 'Iron',
              unit: 'mg',
              amount: 21.4,
              readAgainst: { kind: 'RECOMMENDED', amount: 18 },
              claim: 'CLEARS_REFERENCE',
            }),
          ],
        }),
      },
    })

    // A lower bound, said as one: the window supplied at least this much, and
    // whatever went unmatched can only add to it (ADR 0027).
    const tile = screen.getByRole('group', { name: 'Iron' })
    expect(tile).toHaveTextContent('≥ 21 mg')
    expect(tile).toHaveTextContent('Reference 18 mg')
  })

  it('leads with a nutrient over its limit, and names the line it crossed', async () => {
    await renderSuspended(MicronutrientSection, {
      props: {
        intake: micronutrientIntake({
          rows: [
            micronutrientRow({ label: 'Iron', claim: 'CLEARS_REFERENCE' }),
            micronutrientRow({
              nutrient: 'SODIUM',
              label: 'Sodium',
              unit: 'mg',
              amount: 2430,
              readAgainst: { kind: 'SUGGESTED_DIETARY_TARGET', amount: 2000 },
              claim: 'OVER_LIMIT',
            }),
          ],
        }),
      },
    })

    // Sodium's Upper Level was withdrawn in 2017 and a Suggested Dietary Target
    // put in its place, so the tile names which figure it is rather than calling
    // a population target a safety threshold (ADR 0027).
    const sodium = screen.getByRole('group', { name: 'Sodium' })
    expect(sodium).toHaveTextContent('≥ 2430 mg')
    expect(sodium).toHaveTextContent('Suggested target 2000 mg')
    // First, because it is the one claim that holds at any coverage.
    expect(
      screen
        .getAllByRole('group')
        .map((tile) => tile.getAttribute('aria-label')),
    ).toEqual(['Sodium', 'Iron'])
  })

  it('says which claim each group of tiles is, rather than leaving them to be read alike', async () => {
    await renderSuspended(MicronutrientSection, {
      props: {
        intake: micronutrientIntake({
          rows: [
            micronutrientRow({ label: 'Iron', claim: 'CLEARS_REFERENCE' }),
            micronutrientRow({
              nutrient: 'SODIUM',
              label: 'Sodium',
              claim: 'OVER_LIMIT',
            }),
          ],
        }),
      },
    })

    // Without them a tile is only its subline apart from its opposite, and
    // "Sodium ≥ 2430 mg" says nothing about whether that is a finding.
    expect(
      screen.getByRole('heading', { name: 'Over the limit' }),
    ).toBeVisible()
    expect(
      screen.getByRole('heading', { name: 'Reached the reference' }),
    ).toBeVisible()
  })

  it('names a nutrient it cannot claim, and gives it no figure at all', async () => {
    await renderSuspended(MicronutrientSection, {
      props: {
        intake: micronutrientIntake({
          rows: [
            unstatedMicronutrientRow({
              nutrient: 'VITAMIN_B12',
              label: 'Vitamin B12',
              unit: 'µg',
            }),
            unstatedMicronutrientRow({
              nutrient: 'FOLATE',
              label: 'Folate',
              unit: 'µg',
            }),
            micronutrientRow({ label: 'Iron', claim: 'CLEARS_REFERENCE' }),
          ],
        }),
      },
    })

    // A stat-sized `≥ 2.00 µg of 5 µg` *is* a deficiency readout whatever the
    // caption says, so the absence gets no tile — and the line that names it
    // carries no figure either, which is what "names, never figures" means
    // (ADR 0027).
    expect(
      screen.queryByRole('group', { name: 'Vitamin B12' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/Not enough matched to say/)).toHaveTextContent(
      /^Not enough matched to say: Vitamin B12, Folate\.$/,
    )
  })

  it('declines to draw anything when it can claim nothing, and offers the queue instead', async () => {
    await renderSuspended(MicronutrientSection, {
      props: {
        intake: micronutrientIntake({
          coverage: 0.04,
          rows: [
            unstatedMicronutrientRow({ label: 'Iron' }),
            unstatedMicronutrientRow({ label: 'Zinc' }),
          ],
        }),
      },
    })

    expect(
      screen.getByText(/Match a few of the foods you eat most/),
    ).toBeVisible()
    // Nineteen names under "not enough matched to say" is the whole set, which
    // wastes the screen without misleading anybody — a judgement about
    // usefulness rather than about honesty (ADR 0027).
    expect(
      screen.queryByText(/Not enough matched to say/),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })

  it('asks for a profile, not for matches, when no figures resolve for this body', async () => {
    await renderSuspended(MicronutrientSection, {
      props: {
        intake: micronutrientIntake({
          coverage: 1,
          hasReferenceIntakes: false,
          rows: [unstatedMicronutrientRow({ label: 'Iron' })],
        }),
      },
    })

    // A Reference Intake resolves from sex and age, so with no Profile nothing
    // can be claimed however much is matched — and telling this User to match
    // more food is advice that can never work (ADR 0027).
    expect(screen.getByText(/date of birth on Profile/)).toBeVisible()
    expect(
      screen.queryByText(/Match a few of the foods you eat most/),
    ).not.toBeInTheDocument()
  })

  it('does not ask for matches when there is nothing left to match', async () => {
    await renderSuspended(MicronutrientSection, {
      props: {
        intake: micronutrientIntake({
          coverage: 1,
          unmatched: [],
          rows: [unstatedMicronutrientRow({ label: 'Iron' })],
        }),
      },
    })

    // A week that is fully matched and still supplies too little of everything
    // reaches both states at once. Telling this User to match a few more foods
    // is advice the sentence above has just said is impossible.
    expect(screen.getByText(/Nothing left to match/)).toBeVisible()
    expect(
      screen.queryByText(/Match a few of the foods you eat most/),
    ).not.toBeInTheDocument()
    // Nor the whole nutrient set listed as unsayable, which is the noise the
    // decline exists to avoid — the queue being empty does not make it useful.
    expect(
      screen.queryByText(/Not enough matched to say/),
    ).not.toBeInTheDocument()
  })

  it('says one food in the singular', async () => {
    await renderSuspended(MicronutrientSection, {
      props: { intake: micronutrientIntake({ unmatched: [unmatchedFood()] }) },
    })

    expect(
      screen.getByRole('button', { name: '1 food is not matched yet' }),
    ).toBeVisible()
  })

  it('folds the queue behind one disclosure rather than listing it in the card', async () => {
    await renderSuspended(MicronutrientSection, {
      props: {
        intake: micronutrientIntake({
          unmatched: [
            unmatchedFood({ foodId: 1, name: 'Chicken breast' }),
            unmatchedFood({ foodId: 2, name: 'Jasmine rice' }),
          ],
        }),
      },
    })

    // Named for the state the User can change, not for what Tucker does or does
    // not know about it — and pluralised, because "2 foods is" reads as a bug.
    expect(
      screen.getByRole('button', { name: /2 foods are not matched yet/ }),
    ).toBeVisible()
    expect(screen.queryByText('Chicken breast')).not.toBeInTheDocument()
  })

  it('lists what is left to match with its share, once the queue is opened', async () => {
    await renderSuspended(MicronutrientSection, {
      props: {
        intake: micronutrientIntake({
          unmatched: [
            unmatchedFood({ foodId: 1, name: 'Chicken breast', share: 0.27 }),
            unmatchedFood({ foodId: 2, name: 'Jasmine rice', share: 0.11 }),
          ],
        }),
      },
    })

    await userEvent
      .setup()
      .click(
        screen.getByRole('button', { name: /2 foods are not matched yet/ }),
      )

    const queued = screen.getAllByRole('button', { name: /Match / })
    expect(queued.map((button) => button.textContent?.trim())).toEqual([
      expect.stringContaining('Chicken breast'),
      expect.stringContaining('Jasmine rice'),
    ])
    expect(queued[0]).toHaveTextContent('27%')
    expect(queued[1]).toHaveTextContent('11%')
  })

  it('names a queued Food in sentence case however it was typed', async () => {
    await renderSuspended(MicronutrientSection, {
      props: {
        intake: micronutrientIntake({
          unmatched: [unmatchedFood({ foodId: 3, name: 'LIGHT MILK' })],
        }),
      },
    })

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /1 food is not matched yet/ }))

    expect(
      screen.getByRole('button', { name: 'Match Light milk' }),
    ).toHaveTextContent('Light milk')
  })

  it('asks to match the queued Food the user taps', async () => {
    const onMatch = vi.fn()
    const rice = unmatchedFood({ foodId: 2, name: 'Jasmine rice' })
    await renderSuspended(MicronutrientSection, {
      props: { intake: micronutrientIntake({ unmatched: [rice] }), onMatch },
    })
    const user = userEvent.setup()

    await user.click(
      screen.getByRole('button', { name: /1 food is not matched yet/ }),
    )
    await user.click(screen.getByRole('button', { name: 'Match Jasmine rice' }))

    expect(onMatch).toHaveBeenCalledWith(rice)
  })

  it('carries the attribution, the data limitation and the Australian-data notice', async () => {
    await renderSuspended(MicronutrientSection, {
      props: { intake: micronutrientIntake() },
    })

    // AFCD is CC BY-SA 3.0 AU: naming the source, reproducing the Limitation of
    // Data Statement and carrying the Australian-data notice are licence terms,
    // not decoration (ADR 0027).
    expect(
      screen.getByText(/Australian Food Composition Database/),
    ).toBeVisible()
    expect(screen.getByText(/CC BY-SA 3\.0 AU/)).toBeVisible()
    expect(
      screen.getByText(
        /There are limitations associated with food composition databases\./,
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /based on Australian data and Australia data may not be appropriate for use in other countries/,
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /licence/i })).toHaveAttribute(
      'href',
      'https://www.foodstandards.gov.au/science-data/monitoringnutrients/afcd/datauserlicenceagreement',
    )
  })

  it('names the reference edition in force, and the body it assumes', async () => {
    await renderSuspended(MicronutrientSection, {
      props: { intake: micronutrientIntake() },
    })

    // A Reference Intake is read live and a revision reaches windows that predate
    // it, so without the edition a User has no way to see that the line moved.
    expect(
      screen.getByText(
        /Nutrient Reference Values for Australia and New Zealand \(NHMRC, 2006, sodium revised 2017\)/,
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/National Health and Medical Research Council/),
    ).toBeInTheDocument()
    // Pregnancy and lactation shift several figures substantially and Tucker has
    // no field for either, so the assumption is stated rather than guessed at.
    expect(
      screen.getByText(/not pregnant and not breastfeeding/),
    ).toBeInTheDocument()
  })

  it('reports itself busy while the figures behind it are being refreshed', async () => {
    await renderSuspended(MicronutrientSection, {
      props: { intake: micronutrientIntake({ coverage: 0.62 }), pending: true },
    })

    // Keep-stale-and-dim rather than blank: a match refreshes this card, and the
    // coverage figure on screen is the one from before the match landed
    // (ADR 0007).
    expect(
      screen.getByRole('region', { name: 'Vitamins and minerals' }),
    ).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText(/62% of the last 7 days' calories/)).toBeVisible()
  })

  it('tells a window with nothing logged from one that is fully matched', async () => {
    await renderSuspended(MicronutrientSection, {
      props: {
        intake: micronutrientIntake({
          totalCalories: 0,
          // Nothing was logged, which is what makes the window empty — not that
          // nothing was eaten, which a week of black coffee also satisfies.
          loggedDays: 0,
          coverage: null,
          unmatched: [],
        }),
      },
    })

    expect(screen.getByText('Nothing logged in the last 7 days.')).toBeVisible()
    // A 0% coverage sentence over an empty window would be true and useless: it
    // reads as a failure to match rather than as a week with nothing in it.
    expect(
      screen.queryByText(/came from food Tucker can read/),
    ).not.toBeInTheDocument()
    // Nor "Nothing left to match", which is true of an empty week and says the
    // wrong thing about it: there was never anything to match.
    expect(screen.queryByText(/Nothing left to match/)).not.toBeInTheDocument()
  })

  it('keeps its card, and its queue, for a week that was logged but cost nothing', async () => {
    await renderSuspended(MicronutrientSection, {
      props: {
        intake: micronutrientIntake({
          totalCalories: 0,
          loggedDays: 3,
          coverage: null,
          unmatched: [unmatchedFood({ name: 'Black coffee' })],
        }),
      },
    })

    // Zero calories is a fact about the food, not about the log: a week of diet
    // drinks and black coffee was logged, and saying nothing was hides a queue
    // the backend computed and offered (ADR 0027).
    expect(
      screen.queryByText('Nothing logged in the last 7 days.'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '1 food is not matched yet' }),
    ).toBeVisible()
    // And no coverage sentence, there being no calories to measure a share of —
    // 0% would call a week of matched black coffee unreadable.
    expect(
      screen.queryByText(/came from food Tucker can read/),
    ).not.toBeInTheDocument()
    // And says so, rather than leaving the card headed by a figure that is
    // silently missing — a coverage line absent without explanation reads as a
    // load that failed (ADR 0005).
    expect(
      screen.getByText(
        'Nothing you logged in the last 7 days carried any calories.',
      ),
    ).toBeVisible()
  })

  it('blames no estimated meals for a window that cost nothing at all', async () => {
    await renderSuspended(MicronutrientSection, {
      props: {
        intake: micronutrientIntake({
          totalCalories: 0,
          loggedDays: 3,
          coverage: null,
          unmatched: [],
        }),
      },
    })

    expect(screen.getByText(/Nothing left to match/)).toBeVisible()
    // There is no rest: a window with no calories has no share for estimated
    // meals to be, and a missing coverage figure must not read as a low one.
    expect(
      screen.queryByText(/came from meals you estimated/),
    ).not.toBeInTheDocument()
  })

  it('attributes no rest to estimates and recipes when the window left none', async () => {
    await renderSuspended(MicronutrientSection, {
      props: {
        intake: micronutrientIntake({ coverage: 1, unmatched: [] }),
      },
    })

    // Every calorie came from matched weighed food, so there is no remainder for
    // estimates and recipes to be the cause of. The queue is still empty and says
    // so; what it must not do is explain a share that is not there.
    expect(screen.getByText(/Nothing left to match/)).toBeVisible()
    expect(
      screen.queryByText(/The rest came from meals you estimated/),
    ).not.toBeInTheDocument()
  })

  it('treats coverage that only rounds to 100% as leaving no rest either', async () => {
    await renderSuspended(MicronutrientSection, {
      props: {
        // What a fully covered week actually arrives as: coverage sums its
        // numerator over grouped Foods and its denominator over Entries, so the
        // two orders of addition need not land on exactly 1.
        intake: micronutrientIntake({
          coverage: 0.9999999999999999,
          unmatched: [],
        }),
      },
    })

    expect(screen.getByText(/100% of the last 7 days' calories/)).toBeVisible()
    // The sentence has to agree with the figure printed just above it — an
    // attributed rest under a 100% reading is the card contradicting itself.
    expect(
      screen.queryByText(/The rest came from meals you estimated/),
    ).not.toBeInTheDocument()
  })

  it('names estimated meals as the only rest a tap can never reach', async () => {
    await renderSuspended(MicronutrientSection, {
      props: {
        intake: micronutrientIntake({ coverage: 0.71, unmatched: [] }),
      },
    })

    // A Recipe rolls up from whichever of its ingredients are matched, and an
    // unmatched ingredient is itself a row in the queue — so an empty queue
    // means every ingredient is matched and every recipe counts in full
    // (ADR 0027). Naming recipes here would tell a User their dinners are
    // unreadable at the moment they became readable.
    expect(
      screen.getByText(
        /Nothing left to match\. The rest came from meals you estimated, which have no food to borrow from\./,
      ),
    ).toBeVisible()
    expect(screen.queryByText(/from recipes/)).not.toBeInTheDocument()
  })

  it('drops the queue disclosure once nothing is left to match', async () => {
    await renderSuspended(MicronutrientSection, {
      props: {
        intake: micronutrientIntake({ coverage: 0.71, unmatched: [] }),
      },
    })

    // An empty disclosure is a chore on display with nothing behind it. What
    // the remaining 29% *is* belongs to the test above.
    expect(
      screen.queryByRole('button', { name: /not matched yet/ }),
    ).not.toBeInTheDocument()
  })
})
