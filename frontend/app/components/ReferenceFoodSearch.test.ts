import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import { referenceFoodSearch } from '~~/test/micronutrient-fixtures'
import { referenceFoodsFor } from '~~/test/mocks/handlers/reference-foods'
import { server } from '~~/test/mocks/node'
import ReferenceFoodSearch from './ReferenceFoodSearch.vue'

describe('ReferenceFoodSearch', () => {
  it('lets go of its Food without error when its host takes it away', async () => {
    // A host closing over it hands it null for the length of the close.
    server.use(referenceFoodsFor({ 'Tasty cheese': referenceFoodSearch() }))
    const errors = vi.fn()
    useNuxtApp().hook('vue:error', errors)
    const { rerender } = await renderSuspended(ReferenceFoodSearch, {
      props: { food: { id: 3, name: 'Tasty cheese' } },
    })
    expect(
      screen.getByRole('textbox', { name: 'Search the food database' }),
    ).toHaveValue('Tasty cheese')

    await rerender({ food: null })

    expect(errors).not.toHaveBeenCalled()
    expect(
      screen.getByRole('textbox', { name: 'Search the food database' }),
    ).toHaveValue('Tasty cheese')
  })
})
