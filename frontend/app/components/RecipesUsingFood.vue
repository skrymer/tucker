<!--
  The Recipes a correction of a Food reaches (ADR 0037), collapsed under a
  count: the count is the news, the list is there on request. Absent when no
  Recipe uses the Food.
-->
<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

// Stryker disable next-line all: a compiler macro must stay a top-level statement
const props = defineProps<{
  foodId: number
  moved: boolean
  /** The Food's macros as typed, or null while one has no figure. */
  typed: Record<Macro, number> | null
}>()

/** The Recipes using the Food, read once for the Food the panel is mounted on. */
function useRecipesUsing() {
  const { $api } = useNuxtApp()
  const recipes = ref<components['schemas']['RecipeCompositionResponse'][]>([])
  const error = ref<unknown>(null)
  async function load() {
    error.value = null
    try {
      recipes.value = await $api('/api/foods/{id}/recipes', {
        path: { id: props.foodId },
      })
    } catch (caught) {
      error.value = caught
    }
  }
  onMounted(load)
  return { recipes, error, retry: load }
}
const { recipes, error, retry } = useRecipesUsing()

const expanded = ref(false)

const rows = computed(() =>
  recipes.value.map((recipe) => {
    const rollup = rollupRecipe(recipe.ingredients, recipe.cookedWeightG)
    const before = { kcal: rollup.per100gKcal, protein: rollup.per100gProtein }
    return {
      recipe,
      before,
      after: props.typed
        ? previewRecipeFigures(recipe, props.foodId, props.typed)
        : before,
    }
  }),
)

const recipeNoun = (count: number) => (count === 1 ? 'recipe' : 'recipes')
</script>

<template>
  <LoadErrorState
    nested
    :error="error"
    title="Couldn't check which recipes use it"
    @retry="retry"
  >
    <section v-if="recipes.length" class="rounded-inset border border-default">
      <button
        type="button"
        class="flex w-full items-center gap-2 rounded-inset px-3 py-2.5 text-label text-default focus-visible:outline-2 focus-visible:outline-primary"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        <UIcon
          name="i-lucide-cooking-pot"
          class="size-4 shrink-0 text-primary"
        />
        <span>
          {{ moved ? 'Also updates' : 'Used in' }}
          {{ recipes.length }} {{ recipeNoun(recipes.length) }}
        </span>
        <UIcon
          name="i-lucide-chevron-down"
          class="ms-auto size-4 text-muted transition-transform"
          :class="expanded && 'rotate-180'"
        />
      </button>
      <!-- Scrolls inside the panel at about four rows, so Save stays in reach. -->
      <ul
        v-if="expanded"
        class="max-h-48 divide-y divide-default overflow-y-auto border-t border-default px-3 tabular-nums"
      >
        <li v-for="row in rows" :key="row.recipe.id" class="py-2">
          <FigureRow :name="row.recipe.name">
            <template #figures>
              <FigureDiff :before="row.before" :after="row.after" />
            </template>
          </FigureRow>
        </li>
      </ul>
    </section>
  </LoadErrorState>
</template>
