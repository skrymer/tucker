import { defineComponent, h, ref, watch, type Component } from 'vue'
import { expect, vi } from 'vitest'
import { screen, within } from '@testing-library/vue'
import FoodList from '~/components/FoodList.vue'
import {
  refreshFoodCatalog,
  useFoodCatalog,
} from '~/composables/useFoodCatalog'

/**
 * [sheet] beside the Food catalog as `/foods` lists it, so a test reads what a
 * mutation did where the User would see it (ADR 0034). Props and listeners go
 * to the sheet, so it renders as the sheet's own type.
 */
export function besideCatalog<Sheet extends Component>(sheet: Sheet): Sheet {
  const host = defineComponent({
    inheritAttrs: false,
    async setup(_, { attrs }) {
      const { data } = await useFoodCatalog()
      // The keyed read outlives a test, and an earlier test's refresh can land
      // in this one; a fresh read cancels it, so only this test's re-reads count.
      await refreshFoodCatalog()
      const rereads = ref(0)
      watch(data, () => rereads.value++)
      return () => [
        h(sheet, attrs),
        h(
          'section',
          { 'aria-label': 'Catalog', 'data-rereads': rereads.value },
          [h(FoodList, { foods: data.value ?? [] })],
        ),
      ]
    },
  })
  return host as unknown as Sheet
}

function catalogSection() {
  // An open sheet hides the page behind it, so read past that.
  return screen.getByRole('region', { name: 'Catalog', hidden: true })
}

/** Queries over the catalog [besideCatalog] shows now. */
export function catalog() {
  return within(catalogSection())
}

/**
 * Queries over the catalog once a mutation has re-read it — not the one it
 * opened with, which would pass a test whose mutation changed nothing.
 */
export async function catalogOnceReread() {
  await vi.waitFor(() => expect(catalogSection().dataset.rereads).not.toBe('0'))
  return catalog()
}

/** The Tags the catalog shows on the Food it names [name], by their names. */
export function tagsOn(
  shown: ReturnType<typeof catalog>,
  name: string,
): string[] {
  const list = shown.queryByRole('list', {
    name: `Tags on ${name}`,
    hidden: true,
  })
  if (!list) return []
  return within(list)
    .getAllByRole('listitem', { hidden: true })
    .map((item) => item.textContent?.trim() ?? '')
}
