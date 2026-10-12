import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import { estimatedEntry, weighedEntry } from '~~/test/entry-fixtures'
import EntryList from './EntryList.vue'

describe('EntryList', () => {
  const entries = [
    weighedEntry({
      id: 1,
      foodId: 1,
      foodName: 'ROLLED OATS',
      grams: 60,
      calories: 233,
      protein: 8,
    }),
    estimatedEntry({ id: 2, label: 'Pub burger', calories: 650, protein: 35 }),
  ]

  it('lists each Entry by name with its figures, grams first, and flags an estimate', async () => {
    await renderSuspended(EntryList, { props: { entries } })

    const [oats, burger] = screen.getAllByRole('listitem')
    expect(within(oats!).getByText('Rolled oats')).toBeVisible()
    expect(
      within(oats!).getByText('60 g · 233 kcal · 8 g protein'),
    ).toBeVisible()
    expect(within(oats!).queryByText('est.')).not.toBeInTheDocument()
    expect(within(burger!).getByText('Pub burger')).toBeVisible()
    expect(within(burger!).getByText('650 kcal · 35 g protein')).toBeVisible()
    expect(within(burger!).getByText('est.')).toBeVisible()
  })

  it("puts the caller's action at the end of each row, for that Entry", async () => {
    await renderSuspended(EntryList, {
      props: { entries },
      slots: {
        action: ({ entry }: { entry: { id: number } }) =>
          h('button', `Act on ${entry.id}`),
      },
    })

    const [oats, burger] = screen.getAllByRole('listitem')
    expect(oats).toContainElement(
      screen.getByRole('button', { name: 'Act on 1' }),
    )
    expect(burger).toContainElement(
      screen.getByRole('button', { name: 'Act on 2' }),
    )
  })
})
