import { describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import { food } from '~~/test/food-fixtures'
import { foodCatalog } from '~~/test/mocks/handlers/catalog'
import { server } from '~~/test/mocks/node'
import { refreshFoodCatalog, useFoodCatalog } from './useFoodCatalog'

/** A reader showing the names the catalog holds. */
const reader = defineComponent({
  async setup() {
    const { data } = await useFoodCatalog()
    return { data }
  },
  template: `<ul><li v-for="row in data ?? []" :key="row.id">{{ row.name }}</li></ul>`,
})

describe('useFoodCatalog', () => {
  it('shows a Food added elsewhere once the catalog is refreshed', async () => {
    server.use(...foodCatalog({ foods: [food({ id: 1, name: 'Skyr' })] }))
    await renderSuspended(reader)
    expect(await screen.findByText('Skyr')).toBeVisible()

    // Added behind the reader's back, as a sheet's own mutation does.
    await $fetch('/api/foods', {
      method: 'POST',
      body: {
        name: 'Rolled oats',
        proteinPer100g: 13,
        carbsPer100g: 60,
        fatPer100g: 7,
        tagIds: [],
      },
    })
    await refreshFoodCatalog()

    expect(await screen.findByText('Rolled oats')).toBeVisible()
    expect(screen.getByText('Skyr')).toBeVisible()
  })
})
