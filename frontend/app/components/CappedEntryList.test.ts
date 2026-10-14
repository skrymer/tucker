import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { h } from 'vue'
import { estimatedEntry } from '~~/test/entry-fixtures'
import CappedEntryList from './CappedEntryList.vue'

const fiveEntries = [
  estimatedEntry({ id: 1, calories: 100, label: 'Breakfast' }),
  estimatedEntry({ id: 2, calories: 200, label: 'Morning snack' }),
  estimatedEntry({ id: 3, calories: 300, label: 'Lunch' }),
  estimatedEntry({ id: 4, calories: 400, label: 'Afternoon snack' }),
  estimatedEntry({ id: 5, calories: 500, label: 'Dinner' }),
]

describe('CappedEntryList', () => {
  it('shows the three most recent entries behind a Show all control', async () => {
    await renderSuspended(CappedEntryList, {
      props: { entries: fiveEntries },
    })

    // Entries arrive oldest-first; the most recent three stay visible.
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText('Lunch')).toBeVisible()
    expect(screen.getByText('Afternoon snack')).toBeVisible()
    expect(screen.getByText('Dinner')).toBeVisible()
    expect(screen.queryByText('Breakfast')).not.toBeInTheDocument()
    expect(screen.queryByText('Morning snack')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show all 5' })).toBeVisible()
  })

  it('reveals every entry, each with its action, with Show all and folds back with Show less', async () => {
    await renderSuspended(CappedEntryList, {
      props: { entries: fiveEntries },
      slots: {
        action: ({ entry }: { entry: { name: string } }) =>
          h('button', `Act on ${entry.name}`),
      },
    })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Show all 5' }))

    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(
      screen.getByRole('button', { name: 'Act on Breakfast' }),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: /show all/i }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show less' }))

    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.queryByText('Breakfast')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show all 5' })).toBeVisible()
  })
})
