<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type FoodResponse = components['schemas']['FoodResponse']
type RecipeResponse = components['schemas']['RecipeResponse']

const props = defineProps<{ recipe: FoodResponse | null }>()
const emit = defineEmits<{ close: [] }>()

/**
 * The open recipe's composition, fetched from `GET /api/recipes/{id}` (the
 * ingredient lines aren't on FoodResponse — only `ingredientCount` is). The
 * sheet is one persistent instance whose `recipe` prop foods.vue reassigns, so
 * the fetch resets its state per recipe and ignores a slower earlier response —
 * otherwise a newly opened recipe would flash the previous one's ingredients or
 * error. The cooked weight comes from the fetched (authoritative) RecipeResponse;
 * the per-100g rollup isn't on it, so that alone stays on the prop. A read
 * failure renders LoadErrorState in place — no toast (ADR 0005).
 */
function useRecipeComposition(recipe: () => FoodResponse | null) {
  const { $api } = useNuxtApp()
  const composition = ref<RecipeResponse | null>(null)
  const error = ref<unknown>(null)

  async function load() {
    const current = recipe()
    if (!current) return
    const requestedId = current.id
    // Clear the previous recipe's data/error up front so switching recipes never
    // shows stale ingredients under the new title while the new fetch runs.
    composition.value = null
    error.value = null
    try {
      const result = await $api('/api/recipes/{id}', {
        path: { id: requestedId },
      })
      // A slower earlier fetch must not clobber a recipe the user has since opened.
      if (recipe()?.id === requestedId) composition.value = result
    } catch (caught) {
      if (recipe()?.id === requestedId) error.value = caught
    }
  }

  // Refetch whenever a recipe is opened; immediate covers the first mount.
  watch(recipe, (current) => current && load(), { immediate: true })

  const ingredients = computed(() => composition.value?.ingredients ?? [])
  const cookedWeightG = computed(
    () => composition.value?.cookedWeightG ?? recipe()?.cookedWeightG ?? 0,
  )

  return { ingredients, cookedWeightG, error, retry: load }
}

const { ingredients, cookedWeightG, error, retry } = useRecipeComposition(
  () => props.recipe,
)

const round = (n: number) => Math.round(n)
</script>

<template>
  <ResponsiveOverlay
    :open="recipe !== null"
    :title="recipe?.name ?? ''"
    @update:open="(value) => !value && emit('close')"
  >
    <LoadErrorState
      :error="error"
      title="Couldn't load your recipe"
      @retry="retry"
    >
      <div class="flex flex-col gap-4">
        <!-- Ingredients: name left, grams right, tabular-nums. -->
        <section aria-label="Ingredients" class="flex flex-col gap-2">
          <p class="text-xs font-semibold uppercase tracking-wider text-muted">
            Ingredients
          </p>
          <ul
            role="list"
            class="divide-y divide-default rounded-xl border border-default"
          >
            <li
              v-for="(ing, index) in ingredients"
              :key="index"
              class="flex items-center justify-between gap-3 px-3 py-2.5"
            >
              <span class="min-w-0 truncate text-default">{{ ing.name }}</span>
              <span class="shrink-0 tabular-nums text-muted">
                {{ formatGrams(ing.grams) }}
              </span>
            </li>
          </ul>
        </section>

        <!-- Summary: cooked weight + the rolled-up per-100g (green kcal / coral
             protein, echoing the Ring and the recipe builder). -->
        <section
          aria-label="Recipe summary"
          class="flex flex-col gap-3 rounded-xl bg-elevated/50 p-4"
        >
          <div class="flex items-center justify-between">
            <span
              class="flex items-center gap-2 text-sm font-medium text-muted"
            >
              <UIcon name="i-lucide-cooking-pot" class="size-4" />
              Makes
            </span>
            <span class="font-semibold tabular-nums text-default">
              {{ formatGrams(cookedWeightG) }}
            </span>
          </div>

          <div class="border-t border-default pt-3">
            <p class="text-sm font-medium text-muted">Per 100 g</p>
            <div class="mt-1 flex items-baseline gap-4">
              <p class="text-2xl font-bold tabular-nums text-primary">
                {{ round(recipe?.caloriesPer100g ?? 0) }} kcal
              </p>
              <p class="text-lg font-semibold tabular-nums text-secondary">
                {{ round(recipe?.proteinPer100g ?? 0) }} g protein
              </p>
            </div>
          </div>
        </section>
      </div>
    </LoadErrorState>
  </ResponsiveOverlay>
</template>
