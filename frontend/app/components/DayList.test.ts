import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { estimatedEntry, weighedEntry } from '~~/test/entry-fixtures'
import DayList from './DayList.vue'

const twoEntries = [
  weighedEntry({
    id: 1,
    calories: 107,
    protein: 12,
    foodId: 5,
    foodName: 'Banana',
    grams: 187.5,
  }),
  estimatedEntry({ id: 2, calories: 1081, label: 'Prepped chicken & rice' }),
]

describe('DayList', () => {
  it("is a region named for today and its date, tallying the day's entries and calories", async () => {
    await renderSuspended(DayList, {
      props: {
        day: 'today',
        date: '2026-10-07',
        entries: twoEntries,
        caloriesConsumed: 1188,
      },
    })

    const region = screen.getByRole('region', { name: 'Today · Wed 7 Oct' })
    expect(
      within(region).getByRole('heading', { name: 'Today · Wed 7 Oct' }),
    ).toBeVisible()
    expect(within(region).getByText('2 entries · 1,188 kcal')).toBeVisible()
  })
  it('is a region named for tomorrow and its date', async () => {
    await renderSuspended(DayList, {
      props: {
        day: 'tomorrow',
        date: '2026-10-08',
        entries: twoEntries.slice(1),
        caloriesConsumed: 1081,
      },
    })

    const region = screen.getByRole('region', { name: 'Tomorrow · Thu 8 Oct' })
    expect(within(region).getByText('1 entry · 1,081 kcal')).toBeVisible()
    expect(screen.queryByText(/^Today/)).not.toBeInTheDocument()
  })
  it("lists each entry as its name over its figures, a Weighed entry's whole grams first", async () => {
    await renderSuspended(DayList, {
      props: {
        day: 'today',
        date: '2026-10-07',
        entries: twoEntries,
        caloriesConsumed: 1188,
      },
    })

    const [banana, lunch] = screen.getAllByRole('listitem')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(banana).toHaveTextContent(
      /^Banana\s*188 g · 107 kcal · 12 g protein$/,
    )
    expect(lunch).toHaveTextContent(
      /^Prepped chicken & rice\s*est\.\s*1081 kcal$/,
    )
  })
  it('emits delete with the entry its named delete control belongs to', async () => {
    const onDelete = vi.fn()
    await renderSuspended(DayList, {
      props: {
        day: 'tomorrow',
        date: '2026-10-08',
        entries: twoEntries,
        caloriesConsumed: 1188,
        onDelete,
      },
    })

    await userEvent.setup().click(
      screen.getByRole('button', {
        name: 'Delete Prepped chicken & rice — 1081 kcal',
      }),
    )

    expect(onDelete).toHaveBeenCalledExactlyOnceWith(twoEntries[1])
  })
  const fiveEntries = [
    estimatedEntry({ id: 1, calories: 100, label: 'Breakfast' }),
    estimatedEntry({ id: 2, calories: 200, label: 'Morning snack' }),
    estimatedEntry({ id: 3, calories: 300, label: 'Lunch' }),
    estimatedEntry({ id: 4, calories: 400, label: 'Afternoon snack' }),
    estimatedEntry({ id: 5, calories: 500, label: 'Dinner' }),
  ]

  it('shows the three most recent entries behind a Show all control', async () => {
    await renderSuspended(DayList, {
      props: {
        day: 'tomorrow',
        date: '2026-10-08',
        entries: fiveEntries,
        caloriesConsumed: 1500,
      },
    })

    // Entries arrive oldest-first; the most recent three stay visible.
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText('Afternoon snack')).toBeVisible()
    expect(screen.getByText('Dinner')).toBeVisible()
    expect(screen.getByText('Lunch')).toBeVisible()
    expect(screen.queryByText('Breakfast')).not.toBeInTheDocument()
    expect(screen.queryByText('Morning snack')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show all 5' })).toBeVisible()
    // The tally counts the whole day, not the rows the cap leaves showing.
    expect(screen.getByText('5 entries · 1,500 kcal')).toBeVisible()
  })
  it('reveals every entry with Show all and folds back with Show less', async () => {
    await renderSuspended(DayList, {
      props: {
        day: 'today',
        date: '2026-10-07',
        entries: fiveEntries,
        caloriesConsumed: 1500,
      },
    })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Show all 5' }))

    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(screen.getByText('Breakfast')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Delete Breakfast — 100 kcal' }),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: /show all/i }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show less' }))

    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.queryByText('Breakfast')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show all 5' })).toBeVisible()
  })

  it('offers no Show all when the day is exactly as long as the list shows', async () => {
    await renderSuspended(DayList, {
      props: {
        day: 'today',
        date: '2026-10-07',
        entries: fiveEntries.slice(-3),
        caloriesConsumed: 1200,
      },
    })

    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(
      screen.queryByRole('button', { name: /show all/i }),
    ).not.toBeInTheDocument()
  })
})
