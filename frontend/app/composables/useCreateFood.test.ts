import { describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { foodCatalog } from '~~/test/mocks/handlers/catalog'
import { server } from '~~/test/mocks/node'
import { useCreateFood } from './useCreateFood'
import { useFoodCatalog } from './useFoodCatalog'

const skyr = {
  name: 'Skyr',
  proteinPer100g: 11,
  carbsPer100g: 4,
  fatPer100g: 0.2,
  tagIds: [],
}

/** A host creating Skyr on a tap, handing each save to [landed]. */
const creator = (landed: (save: Promise<unknown>) => Promise<unknown>) =>
  defineComponent({
    setup: () => ({ create: useCreateFood(landed).execute }),
    template: `<button @click="create(skyr)">create</button>`,
    data: () => ({ skyr }),
  })

describe('useCreateFood', () => {
  it('hands its caller the Food the server created', async () => {
    server.use(...foodCatalog())
    const created = vi.fn()
    await renderSuspended(creator(async (save) => created(await save)))

    await userEvent.click(screen.getByRole('button', { name: 'create' }))

    await vi.waitFor(() =>
      expect(created).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ name: 'Skyr', caloriesPer100g: 61.8 }),
      ),
    )
  })

  it('re-reads the catalog for whoever is showing it', async () => {
    server.use(...foodCatalog())
    const shown = defineComponent({
      components: { creator: creator((save) => save) },
      async setup() {
        const { data } = await useFoodCatalog()
        return { data }
      },
      template: `<creator /><ul><li v-for="row in data ?? []" :key="row.id">{{ row.name }}</li></ul>`,
    })
    await renderSuspended(shown)

    await userEvent.click(screen.getByRole('button', { name: 'create' }))

    expect(await screen.findByText('Skyr')).toBeVisible()
  })
})
