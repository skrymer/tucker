<!--
  The Recipes a correction of a Food reaches (ADR 0037), collapsed under a
  count: the count is the news, the list is there on request. Absent when no
  Recipe uses the Food.
-->
<script setup lang="ts">
// Stryker disable next-line all: a compiler macro must stay a top-level statement
const props = defineProps<{
  foodId: number
  /** The Food's macros as typed once one has moved, else null. */
  correction: Record<Macro, number> | null
}>()
/** Whether the first read has answered, either way — what Save waits on. */
// Stryker disable next-line all: a compiler macro must stay a top-level statement
const settled = defineModel<boolean>('settled', { required: true })

/** The Recipes using the Food, read once for the Food the panel is mounted on. */
function useRecipesUsing() {
  const { $api } = useNuxtApp()
  const { data, error, busy, load } = useOptionalFetch(
    (signal) =>
      $api('/api/foods/{id}/recipes', { path: { id: props.foodId }, signal }),
    // A stalled read must not hold Save past ADR 0007's 8 s.
    { timeoutMs: 8000 },
  )
  settled.value = false
  onMounted(async () => {
    await load()
    settled.value = true
  })
  const recipes = computed(() => data.value ?? [])
  const checking = computed(() => busy.value && data.value === null)
  return { recipes, error, checking, load }
}
const { recipes, error, checking, load } = useRecipesUsing()

const rows = computed(() =>
  recipes.value.map((recipe) => {
    const before = {
      kcal: recipe.caloriesPer100g,
      protein: recipe.proteinPer100g,
    }
    return {
      recipe,
      before,
      after: props.correction
        ? previewRecipeFigures(recipe, props.foodId, props.correction)
        : before,
    }
  }),
)
</script>

<template>
  <LoadErrorState
    nested
    :error="error"
    title="Couldn't check which recipes use it"
    @retry="load"
  >
    <p
      v-if="checking"
      role="status"
      aria-label="Checking recipes"
      class="flex items-center gap-2 px-3 py-2.5 text-label text-muted"
    >
      <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
      Checking recipes…
    </p>
    <UCollapsible
      v-else-if="recipes.length"
      class="rounded-inset border border-default"
    >
      <template #default="{ open }">
        <button
          type="button"
          class="flex w-full items-center gap-2 rounded-inset px-3 py-2.5 text-label text-default focus-visible:outline-2 focus-visible:outline-primary"
        >
          <UIcon
            name="i-lucide-cooking-pot"
            class="size-4 shrink-0 text-primary"
          />
          <span>
            {{ correction ? 'Also updates' : 'Used in' }}
            {{ recipes.length }}
            {{ recipes.length === 1 ? 'recipe' : 'recipes' }}
          </span>
          <UIcon
            name="i-lucide-chevron-down"
            class="ms-auto size-4 text-muted transition-transform"
            :class="open && 'rotate-180'"
          />
        </button>
      </template>
      <template #content>
        <!-- Scrolls inside the panel at about four rows, so Save stays in reach. -->
        <ul
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
      </template>
    </UCollapsible>
  </LoadErrorState>
</template>
