import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerEndpoint, renderSuspended } from '@nuxt/test-utils/runtime'
import { readBody } from 'h3'
import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { food } from '~~/test/food-fixtures'
import Log from './log.vue'

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

let frequent = [eggs, oats]
let catalog = [eggs, oats]
registerEndpoint('/api/foods/frequent', () => frequent)
registerEndpoint('/api/foods', () => catalog)

const logged: unknown[] = []
let overBudget = false
registerEndpoint('/api/entries/weighed/preview', {
  method: 'POST',
  handler: () => ({
    wouldExceedBudget: overBudget,
    calorieBudget: 1900,
    overByKcal: overBudget ? 180 : null,
  }),
})
registerEndpoint('/api/entries/weighed', {
  method: 'POST',
  handler: async (event) => {
    logged.push(await readBody(event))
    return { id: 1, kind: 'WEIGHED', label: 'Rolled oats', calories: 300 }
  },
})

const estimated: unknown[] = []
registerEndpoint('/api/entries/estimated/preview', {
  method: 'POST',
  handler: () => ({
    wouldExceedBudget: overBudget,
    calorieBudget: 1900,
    overByKcal: overBudget ? 180 : null,
  }),
})
registerEndpoint('/api/entries/estimated', {
  method: 'POST',
  handler: async (event) => {
    estimated.push(await readBody(event))
    return { id: 2, kind: 'ESTIMATED', label: 'Work canteen', calories: 640 }
  },
})

/**
 * Every knob restored before each test, so a test states only its deviation and
 * the file does not depend on its own order.
 */
beforeEach(() => {
  frequent = [eggs, oats]
  catalog = [eggs, oats]
  overBudget = false
  logged.length = 0
  estimated.length = 0
})

describe('/log', () => {
  it('offers the Frequent Foods in the order the backend ranked them', async () => {
    await renderSuspended(Log)

    const grid = screen.getByRole('list')
    expect(
      within(grid)
        .getAllByRole('button')
        .map((cell) => cell.getAttribute('aria-label')),
    ).toEqual(['Log Free-range eggs', 'Log Rolled oats'])
  })

  it('logs the grams weighed against the local day when a Food is picked', async () => {
    const user = userEvent.setup()
    await renderSuspended(Log)

    await user.click(screen.getByRole('button', { name: 'Log Rolled oats' }))
    const sheet = await screen.findByRole('dialog', { name: 'Log Rolled oats' })
    await user.type(within(sheet).getByLabelText(/weight \(g\)/i), '80')
    await user.click(within(sheet).getByRole('button', { name: /log entry/i }))

    await vi.waitFor(() => expect(logged).toHaveLength(1))
    expect(logged[0]).toEqual({ date: localToday(), foodId: 7, grams: 80 })
  })

  it('warns before committing an entry that would exceed the Calorie Budget', async () => {
    overBudget = true
    const user = userEvent.setup()
    await renderSuspended(Log)

    await user.click(screen.getByRole('button', { name: 'Log Rolled oats' }))
    const sheet = await screen.findByRole('dialog', { name: 'Log Rolled oats' })
    await user.type(within(sheet).getByLabelText(/weight \(g\)/i), '800')
    await user.click(within(sheet).getByRole('button', { name: /log entry/i }))

    // The first Save previews and stops; the entry is not logged yet.
    const logAnyway = await within(sheet).findByRole('button', {
      name: 'Log anyway',
    })
    expect(logged).toHaveLength(0)

    // The next deliberate tap commits it.
    await user.click(logAnyway)
    await vi.waitFor(() => expect(logged).toHaveLength(1))
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

    await vi.waitFor(() => expect(estimated).toHaveLength(1))
    expect(estimated[0]).toEqual({
      date: localToday(),
      label: 'Work canteen',
      calories: 640,
    })
  })

  it('hands a User with no Foods to the catalog with the Add sheet open', async () => {
    // Log picks from what exists and never creates a Food (ADR 0028), so an
    // empty catalog is a dead end unless it points somewhere.
    frequent = []
    catalog = []
    await renderSuspended(Log)

    expect(
      screen.getByRole('link', { name: /add your first food/i }),
    ).toHaveAttribute('href', '/foods?add=1')
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('shows no ranked section at all when nothing was logged in the window', async () => {
    // Never a stale rotation from a longer window or an all-time count
    // (CONTEXT.md — Frequent Foods), and never an empty grid under a heading
    // that promises one.
    frequent = []
    catalog = [eggs, oats]
    await renderSuspended(Log)

    expect(screen.queryByText(/frequent foods/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
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
    overBudget = true
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
})
