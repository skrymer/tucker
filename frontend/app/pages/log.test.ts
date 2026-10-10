import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, renderSuspended } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { food } from '~~/test/food-fixtures'
import { entryLog } from '~~/test/mocks/handlers/entries'
import {
  catalogFails,
  catalogOf,
  frequentFoods,
  frequentFoodsFail,
} from '~~/test/mocks/handlers/foods'
import { server } from '~~/test/mocks/node'
import Log from './log.vue'

// The page renders no toaster of its own, so the toast a User would read is
// what `useToast` is handed.
const { toastAdd } = vi.hoisted(() => ({ toastAdd: vi.fn() }))
mockNuxtImport('useToast', () => () => ({ add: toastAdd, remove: vi.fn() }))

const oats = food({
  id: 7,
  name: 'Rolled oats',
  caloriesPer100g: 379,
  proteinPer100g: 13.2,
})
const eggs = food({
  id: 8,
  name: 'Free-range eggs',
  caloriesPer100g: 143,
  proteinPer100g: 12.6,
})

// In the catalog and out of the rotation — the Food slice 2 exists to find.
const tuna = food({
  id: 9,
  name: 'Tinned tuna',
  caloriesPer100g: 116,
  proteinPer100g: 25.5,
})

const catalog = [eggs, oats, tuna]

/** Logging the catalog's Foods against today, under [calorieBudget]. */
const logEntries = (calorieBudget?: number) =>
  entryLog({ today: localToday(), foods: catalog, calorieBudget })

/** A Calorie Budget every portion in these tests exceeds, so Save stops to warn. */
const OVER_ANY_PORTION = 100

/** The last toast the User was shown. */
const lastToast = () => toastAdd.mock.calls.at(-1)?.[0]

// A test stating its own catalog, ranking or log `use()`s it after this, which
// wins.
beforeEach(() => {
  toastAdd.mockClear()
  server.use(catalogOf(catalog), frequentFoods([eggs, oats]), ...logEntries())
})

/**
 * The ranked grid, addressed by the section that names it. Both sections offer
 * `Log <name>` for a Food in each, which is what the two regions are for.
 */
const frequentSection = () =>
  within(screen.getByRole('region', { name: 'Frequent foods' }))

describe('/log', () => {
  it('offers the Frequent Foods in the order the backend ranked them', async () => {
    await renderSuspended(Log)

    expect(
      frequentSection()
        .getAllByRole('button')
        .map((cell) => cell.getAttribute('aria-label')),
    ).toEqual(['Log Free-range eggs', 'Log Rolled oats'])
  })

  it('lists the whole catalog under the grid, the ranked Foods included', async () => {
    await renderSuspended(Log)

    const all = within(screen.getByRole('region', { name: 'All foods' }))
    expect(
      all.getAllByRole('button').map((row) => row.getAttribute('aria-label')),
    ).toEqual(['Log Free-range eggs', 'Log Rolled oats', 'Log Tinned tuna'])
  })

  it('collapses the two sections into one list of matches while a query is typed', async () => {
    const user = userEvent.setup()
    await renderSuspended(Log)

    await user.type(screen.getByLabelText('Filter foods'), 'tun')

    // Ten unrelated Frequent Foods above the matches would answer a question
    // the User has stopped asking (ADR 0028).
    expect(
      screen.queryByRole('region', { name: 'Frequent foods' }),
    ).not.toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'Matching foods' }))
        .getAllByRole('button')
        .map((row) => row.getAttribute('aria-label')),
    ).toEqual(['Log Tinned tuna'])
  })

  it('restores the grid and the whole catalog when the query is cleared', async () => {
    const user = userEvent.setup()
    await renderSuspended(Log)
    const field = screen.getByLabelText('Filter foods')
    await user.type(field, 'tun')

    await user.click(screen.getByRole('button', { name: 'Clear filter' }))

    expect(field).toHaveValue('')
    expect(screen.getByRole('region', { name: 'Frequent foods' })).toBeVisible()
    expect(
      within(screen.getByRole('region', { name: 'All foods' })).getAllByRole(
        'button',
      ),
    ).toHaveLength(3)
  })

  it('names what a query found nothing for, rather than leaving a blank area', async () => {
    const user = userEvent.setup()
    await renderSuspended(Log)

    // Typed with padding, so the message quotes the query that was asked
    // rather than the keystrokes that carried it.
    await user.type(screen.getByLabelText('Filter foods'), '  quinoa  ')

    expect(screen.getByText('No foods match \u201cquinoa\u201d.')).toBeVisible()
    expect(
      within(
        screen.getByRole('region', { name: 'Matching foods' }),
      ).queryByRole('list'),
    ).not.toBeInTheDocument()
  })

  it('logs a Food found by filtering through the same sheet and budget gate', async () => {
    // One path, not a second one beside the grid's: the /foods row tap was the
    // one way of creating an Entry with no Budget Projection (ADR 0028).
    server.use(...logEntries(OVER_ANY_PORTION))
    const user = userEvent.setup()
    await renderSuspended(Log)
    await user.type(screen.getByLabelText('Filter foods'), 'tun')

    await user.click(screen.getByRole('button', { name: 'Log Tinned tuna' }))
    const sheet = await screen.findByRole('dialog', { name: 'Log Tinned tuna' })
    await user.type(within(sheet).getByLabelText(/weight \(g\)/i), '120')
    await user.click(within(sheet).getByRole('button', { name: /log entry/i }))

    // The first Save previews and stops, exactly as a picked cell does.
    const logAnyway = await within(sheet).findByRole('button', {
      name: 'Log anyway',
    })
    expect(toastAdd).not.toHaveBeenCalled()

    await user.click(logAnyway)
    // 120 g of the tuna, against today — the only day the log accepts.
    await vi.waitFor(() =>
      expect(lastToast()).toMatchObject({
        title: 'Entry logged',
        description: 'Tinned tuna — 120 g · 139 kcal · 31 g protein',
      }),
    )
  })

  it('says the connection failed once, not twice, when neither read lands', async () => {
    // Two independent reads, but one fault — the rule the layout already
    // applies to the signed-out shell: one clear message beats two identical
    // Retry cards.
    let down = true
    server.use(
      frequentFoodsFail(() => down),
      catalogFails(() => down),
    )
    const user = userEvent.setup()
    await renderSuspended(Log)

    expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(1)
    // And the way in that needs neither read is still there.
    expect(
      screen.getByRole('button', { name: /log an estimate instead/i }),
    ).toBeVisible()

    // One Retry, both reads: a button that recovered half the page would leave
    // the other half claiming a fault that is over.
    down = false
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(
      await screen.findByRole('region', { name: 'Frequent foods' }),
    ).toBeVisible()
    // Both reads are in flight and neither is awaited, so this one waits too.
    expect(
      await screen.findByRole('region', { name: 'All foods' }),
    ).toBeVisible()
  })

  it('leaves the grid standing for a query of whitespace alone', async () => {
    // A space is not a question. `narrowFoods` states that rule for the list;
    // the two states have to agree with it or a brushed space bar collapses a
    // grid nothing was asked to narrow.
    const user = userEvent.setup()
    await renderSuspended(Log)

    await user.type(screen.getByLabelText('Filter foods'), '   ')

    expect(screen.getByRole('region', { name: 'Frequent foods' })).toBeVisible()
    expect(screen.getByRole('region', { name: 'All foods' })).toBeVisible()
  })

  it('keeps the grid when only the catalog read fails, and names that read', async () => {
    // The two are separate error states precisely so neither can blank the
    // section the other loaded.
    server.use(catalogFails())
    await renderSuspended(Log)

    expect(screen.getByRole('region', { name: 'Frequent foods' })).toBeVisible()
    expect(
      screen.getByRole('heading', { name: "Couldn't load your foods" }),
    ).toBeVisible()
    expect(
      screen.queryByRole('heading', {
        name: "Couldn't load your frequent foods",
      }),
    ).not.toBeInTheDocument()
  })

  it("logs the grams weighed against today's date when a Food is picked", async () => {
    const user = userEvent.setup()
    await renderSuspended(Log)

    await user.click(
      frequentSection().getByRole('button', { name: 'Log Rolled oats' }),
    )
    const sheet = await screen.findByRole('dialog', { name: 'Log Rolled oats' })
    await user.type(within(sheet).getByLabelText(/weight \(g\)/i), '80')
    await user.click(within(sheet).getByRole('button', { name: /log entry/i }))

    // 80 g of the oats, against today — the only day the log accepts.
    await vi.waitFor(() =>
      expect(lastToast()).toMatchObject({
        title: 'Entry logged',
        description: 'Rolled oats — 80 g · 303 kcal · 11 g protein',
      }),
    )
    expect(
      screen.queryByRole('dialog', { name: 'Log Rolled oats' }),
    ).not.toBeInTheDocument()
  })

  it('warns before committing an entry that would exceed the Calorie Budget', async () => {
    server.use(...logEntries(OVER_ANY_PORTION))
    const user = userEvent.setup()
    await renderSuspended(Log)

    await user.click(
      frequentSection().getByRole('button', { name: 'Log Rolled oats' }),
    )
    const sheet = await screen.findByRole('dialog', { name: 'Log Rolled oats' })
    await user.type(within(sheet).getByLabelText(/weight \(g\)/i), '800')
    await user.click(within(sheet).getByRole('button', { name: /log entry/i }))

    // The first Save previews and stops; the entry is not logged yet.
    const logAnyway = await within(sheet).findByRole('button', {
      name: 'Log anyway',
    })
    expect(toastAdd).not.toHaveBeenCalled()

    // The next deliberate tap commits it.
    await user.click(logAnyway)
    await vi.waitFor(() =>
      expect(lastToast()).toMatchObject({
        title: 'Entry logged',
        description: 'Rolled oats — 800 g · 3032 kcal · 106 g protein',
      }),
    )
  })

  it('logs an estimate as a peer of picking a Food', async () => {
    // An Estimated Entry has no Food, so the grid has nowhere to put it — and
    // this is the first home it has had outside Today's sheet (ADR 0028).
    const user = userEvent.setup()
    await renderSuspended(Log)

    await user.click(
      screen.getByRole('button', { name: /log an estimate instead/i }),
    )
    const sheet = await screen.findByRole('dialog', {
      name: /log an estimate/i,
    })
    await user.type(within(sheet).getByLabelText('Label'), 'Work canteen')
    await user.type(within(sheet).getByLabelText('Calories'), '640')
    await user.click(
      within(sheet).getByRole('button', { name: /log estimated entry/i }),
    )

    // Against today — the only day the log accepts.
    await vi.waitFor(() =>
      expect(lastToast()).toMatchObject({
        title: 'Entry logged',
        description: 'Work canteen — 640 kcal',
      }),
    )
    expect(
      screen.queryByRole('dialog', { name: /log an estimate/i }),
    ).not.toBeInTheDocument()
  })

  it('hands a User with no Foods to the catalog with the Add sheet open', async () => {
    // Log picks from what exists and never creates a Food (ADR 0028), so an
    // empty catalog is a dead end unless it points somewhere.
    server.use(catalogOf([]), frequentFoods([]))
    await renderSuspended(Log)

    expect(
      screen.getByRole('link', { name: /add your first food/i }),
    ).toHaveAttribute('href', '/foods?add=1')
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    // And no field over nothing: a filter offers to narrow a catalog that is
    // not there.
    expect(screen.queryByLabelText('Filter foods')).not.toBeInTheDocument()
  })

  it('answers an empty catalog with the dead end alone, not a ranking error above it', async () => {
    // A User with no Foods can have no rotation, so a failed ranking read tells
    // them nothing they can act on — and two full-height panels read as two
    // things broken.
    server.use(frequentFoodsFail(), catalogOf([]))
    await renderSuspended(Log)

    expect(
      screen.getByRole('link', { name: /add your first food/i }),
    ).toBeVisible()
    expect(
      screen.queryByRole('heading', {
        name: "Couldn't load your frequent foods",
      }),
    ).not.toBeInTheDocument()
  })

  it('shows no ranked section at all when nothing was logged in the window', async () => {
    // Never a stale rotation from a longer window or an all-time count
    // (CONTEXT.md — Frequent Foods), and never an empty grid under a heading
    // that promises one.
    server.use(frequentFoods([]), catalogOf([eggs, oats]))
    await renderSuspended(Log)

    expect(
      screen.queryByRole('region', { name: 'Frequent foods' }),
    ).not.toBeInTheDocument()
    // The catalog is still listed under it — a quiet month is not an empty one.
    expect(
      within(screen.getByRole('region', { name: 'All foods' })).getAllByRole(
        'button',
      ),
    ).toHaveLength(2)
    // But it says so, rather than leaving a primary destination blank between
    // the heading and the estimate button.
    expect(
      screen.getByText(/nothing logged in the last 30 days/i),
    ).toBeVisible()
    // The estimate is still a way in — it needs no Food and no history.
    expect(
      screen.getByRole('button', { name: /log an estimate instead/i }),
    ).toBeVisible()
  })

  it('opens the estimate sheet clean after one was abandoned over budget', async () => {
    server.use(...logEntries(OVER_ANY_PORTION))
    const user = userEvent.setup()
    await renderSuspended(Log)
    const open = () =>
      user.click(
        screen.getByRole('button', { name: /log an estimate instead/i }),
      )

    await open()
    let sheet = await screen.findByRole('dialog', { name: /log an estimate/i })
    await user.type(within(sheet).getByLabelText('Label'), 'Big lunch')
    await user.type(within(sheet).getByLabelText('Calories'), '1500')
    await user.click(
      within(sheet).getByRole('button', { name: /log estimated entry/i }),
    )
    await within(sheet).findByRole('button', { name: 'Log anyway' })
    await user.click(within(sheet).getByRole('button', { name: /close/i }))

    await open()
    sheet = await screen.findByRole('dialog', { name: /log an estimate/i })

    // The form is blank again, so a warning about the abandoned entry would be
    // a claim about an entry that no longer exists.
    expect(within(sheet).queryByText(/over your/i)).not.toBeInTheDocument()
    expect(
      within(sheet).getByRole('button', { name: /log estimated entry/i }),
    ).toBeVisible()
  })

  it('opens the estimate sheet on Today after Tomorrow was chosen in the last one', async () => {
    // Last night's Tomorrow must not catch today's lunch.
    const user = userEvent.setup()
    await renderSuspended(Log)
    const open = async () => {
      await user.click(
        screen.getByRole('button', { name: /log an estimate instead/i }),
      )
      return screen.findByRole('dialog', { name: /log an estimate/i })
    }

    let sheet = await open()
    await user.click(within(sheet).getByRole('radio', { name: /^Tomorrow/ }))
    await user.click(within(sheet).getByRole('button', { name: /close/i }))

    sheet = await open()

    expect(within(sheet).getByRole('radio', { name: /^Today/ })).toBeChecked()
    expect(
      within(sheet).getByRole('radio', { name: /^Tomorrow/ }),
    ).not.toBeChecked()
    expect(
      within(sheet).getByRole('button', { name: 'Log estimated entry' }),
    ).toBeVisible()
  })
})

describe('/log narrowed by a Tag', () => {
  const breakfast = { id: 20, name: 'breakfast' }
  const dinner = { id: 21, name: 'Dinner' }

  const tagged = [
    { ...eggs, tags: [breakfast, dinner] },
    { ...oats, tags: [breakfast] },
    { ...tuna, tags: [dinner] },
  ]

  beforeEach(() => {
    server.use(catalogOf(tagged), frequentFoods([tagged[0]!, tagged[1]!]))
  })

  const chips = () =>
    within(screen.getByRole('group', { name: 'Filter by tag' }))

  it('offers All and every Tag carrying a Food, alphabetically, with All chosen', async () => {
    await renderSuspended(Log)

    const offered = chips().getAllByRole('button')
    expect(offered.map((chip) => chip.textContent?.trim())).toEqual([
      'All',
      'breakfast',
      'Dinner',
    ])
    expect(offered.map((chip) => chip.getAttribute('aria-pressed'))).toEqual([
      'true',
      'false',
      'false',
    ])
  })

  it('collapses the two sections into one list of the Foods carrying the chosen Tag', async () => {
    const user = userEvent.setup()
    await renderSuspended(Log)

    await user.click(chips().getByRole('button', { name: 'Dinner' }))

    expect(
      screen.queryByRole('region', { name: 'Frequent foods' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'All foods' }),
    ).not.toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'Dinner foods' }))
        .getAllByRole('button')
        .map((row) => row.getAttribute('aria-label')),
    ).toEqual(['Log Free-range eggs', 'Log Tinned tuna'])
    expect(chips().getByRole('button', { name: 'Dinner' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(chips().getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('offers to clear the field only when something is typed in it', async () => {
    // The chips are the way back from a Tag; a field-clearing button beside an
    // empty field would clear nothing.
    const user = userEvent.setup()
    await renderSuspended(Log)

    await user.click(chips().getByRole('button', { name: 'Dinner' }))

    expect(
      screen.queryByRole('button', { name: 'Clear filter' }),
    ).not.toBeInTheDocument()
  })

  it('narrows by the Tag and the query together, naming both', async () => {
    const user = userEvent.setup()
    await renderSuspended(Log)

    await user.click(chips().getByRole('button', { name: 'breakfast' }))
    await user.type(screen.getByLabelText('Filter foods'), ' oat ')

    expect(
      within(
        screen.getByRole('region', {
          name: 'breakfast foods matching “oat”',
        }),
      )
        .getAllByRole('button')
        .map((row) => row.getAttribute('aria-label')),
    ).toEqual(['Log Rolled oats'])
  })

  it('names the Tag and the query when together they find nothing', async () => {
    // The oats match "oat" but are not a dinner Food, so a message naming the
    // query alone would read as though the oats had gone missing.
    const user = userEvent.setup()
    await renderSuspended(Log)

    await user.click(chips().getByRole('button', { name: 'Dinner' }))
    await user.type(screen.getByLabelText('Filter foods'), 'oat')

    expect(screen.getByText('No Dinner foods match “oat”.')).toBeVisible()
  })

  it('returns to the rotation when All is chosen', async () => {
    const user = userEvent.setup()
    await renderSuspended(Log)
    await user.click(chips().getByRole('button', { name: 'Dinner' }))

    await user.click(chips().getByRole('button', { name: 'All' }))

    expect(screen.getByRole('region', { name: 'Frequent foods' })).toBeVisible()
    expect(screen.getByRole('region', { name: 'All foods' })).toBeVisible()
    expect(chips().getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('returns to the rotation when the chosen Tag is chosen again', async () => {
    const user = userEvent.setup()
    await renderSuspended(Log)
    const dinnerChip = chips().getByRole('button', { name: 'Dinner' })
    await user.click(dinnerChip)

    await user.click(dinnerChip)

    expect(screen.getByRole('region', { name: 'Frequent foods' })).toBeVisible()
    expect(dinnerChip).toHaveAttribute('aria-pressed', 'false')
  })

  it('moves the choice to another Tag rather than holding two', async () => {
    const user = userEvent.setup()
    await renderSuspended(Log)
    await user.click(chips().getByRole('button', { name: 'breakfast' }))

    await user.click(chips().getByRole('button', { name: 'Dinner' }))

    expect(
      chips()
        .getAllByRole('button')
        .map((chip) => chip.getAttribute('aria-pressed')),
    ).toEqual(['false', 'false', 'true'])
    expect(
      within(screen.getByRole('region', { name: 'Dinner foods' }))
        .getAllByRole('button')
        .map((row) => row.getAttribute('aria-label')),
    ).toEqual(['Log Free-range eggs', 'Log Tinned tuna'])
  })

  it("logs a Food from a Tag's list through the same budget gate as the grid", async () => {
    server.use(...logEntries(OVER_ANY_PORTION))
    const user = userEvent.setup()
    await renderSuspended(Log)
    await user.click(chips().getByRole('button', { name: 'Dinner' }))

    await user.click(screen.getByRole('button', { name: 'Log Tinned tuna' }))
    const sheet = await screen.findByRole('dialog', { name: 'Log Tinned tuna' })
    await user.type(within(sheet).getByLabelText(/weight \(g\)/i), '120')
    await user.click(within(sheet).getByRole('button', { name: /log entry/i }))

    // The first Save previews and stops, exactly as a picked cell does.
    const logAnyway = await within(sheet).findByRole('button', {
      name: 'Log anyway',
    })
    expect(toastAdd).not.toHaveBeenCalled()

    await user.click(logAnyway)
    // 120 g of the tuna, against today — the only day the log accepts.
    await vi.waitFor(() =>
      expect(lastToast()).toMatchObject({
        title: 'Entry logged',
        description: 'Tinned tuna — 120 g · 139 kcal · 31 g protein',
      }),
    )
  })

  it('sets a failed ranking aside while a Tag is chosen, and brings it back after', async () => {
    // A Tag has stopped asking about the rotation, so a Retry for a grid it is
    // hiding recovers nothing — exactly as a typed query treats it.
    server.use(frequentFoodsFail())
    const user = userEvent.setup()
    await renderSuspended(Log)
    const failed = "Couldn't load your frequent foods"
    expect(screen.getByRole('heading', { name: failed })).toBeVisible()

    await user.click(chips().getByRole('button', { name: 'Dinner' }))
    expect(
      screen.queryByRole('heading', { name: failed }),
    ).not.toBeInTheDocument()

    await user.click(chips().getByRole('button', { name: 'All' }))
    expect(screen.getByRole('heading', { name: failed })).toBeVisible()
  })

  it('offers no chips at all while no Food carries a Tag', async () => {
    // "All" alone is a choice of one, and a User who has never tagged a Food
    // should not meet a control they cannot use.
    server.use(catalogOf(catalog))
    await renderSuspended(Log)

    expect(
      screen.queryByRole('group', { name: 'Filter by tag' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'All foods' })).toBeVisible()
  })
})
