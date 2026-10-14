<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type FoodResponse = components['schemas']['FoodResponse']

const { data: foods, error: foodsError, refresh } = await useFoodCatalog()

// Gated explicitly on the setting, never on whether a row happens to hold a
// match: a weight-only User who matched foods before turning tracking off would
// otherwise keep the whole borrow surface (ADR 0027). Awaited here for the
// reason `/review` awaits it — a *setup* has no guarantee the navigation's
// Profile read has landed (AppNav.vue), and it joins that read rather than
// issuing a second (useCalorieTracking).
const { tracksCalories, ready: trackingSettled } = useCalorieTracking()
await trackingSettled()

const route = useRoute()
const router = useRouter()
const open = ref(opensAddSheet(route.query))
const selectedFood = ref<FoodResponse | null>(null)
/**
 * The Recipe whose row asked to open it, and whether on its editor (its Edit)
 * or its read-only composition (View ingredients) — non-null opens the sheet.
 */
const recipeToOpen = ref<{ recipe: FoodResponse; edit: boolean } | null>(null)
const isDesktop = useIsDesktop()

// The hand-off is spent once the sheet closes; left in the URL it reopens the
// sheet on a reload, over a catalog the User has since stocked.
watch(open, (isOpen) => {
  if (isOpen || !opensAddSheet(route.query)) return
  const { add: _spent, ...rest } = route.query
  router.replace({ query: rest })
})

/**
 * The plain Food being corrected (ADR 0037) — non-null opens its sheet, which
 * also holds its Tags and its Reference Food match. Read from the catalog by id,
 * so a match changed inside the sheet shows there as soon as the catalog re-reads;
 * a re-read that fails empties the catalog, and the sheet keeps the Food it last
 * read rather than closing over the User's unsaved edits.
 */
const foodIdToEdit = ref<number | null>(null)
const foodToEdit = computed<FoodResponse | null>((last) => {
  const id = foodIdToEdit.value
  if (id === null) return null
  const read = foods.value?.find((food) => food.id === id)
  return read ?? (last?.id === id ? last : null)
})

/** A row's Edit: a Recipe opens in its editor, a plain Food in its Edit sheet. */
function edit(food: FoodResponse) {
  if (food.kind === 'RECIPE') recipeToOpen.value = { recipe: food, edit: true }
  else foodIdToEdit.value = food.id
}

const manageTagsOpen = ref(false)
</script>

<template>
  <section class="flex flex-col gap-4">
    <header class="flex items-center gap-2">
      <h1 class="text-h1 text-default">Foods</h1>
      <UButton
        icon="i-lucide-tags"
        color="neutral"
        variant="ghost"
        class="ms-auto"
        @click="manageTagsOpen = true"
      >
        Manage tags
      </UButton>
      <UButton
        v-if="isDesktop"
        icon="i-lucide-plus"
        color="primary"
        @click="
          () => {
            open = true
          }
        "
      >
        Add food
      </UButton>
    </header>

    <LoadErrorState
      :error="foodsError"
      title="Couldn't load your foods"
      @retry="refresh"
    >
      <FoodList
        v-if="foods && foods.length > 0"
        :foods="foods"
        :tracks-calories="tracksCalories"
        @delete="selectedFood = $event"
        @view="recipeToOpen = { recipe: $event, edit: false }"
        @edit="edit"
      />
      <FoodEmptyState v-else @add="open = true" />
    </LoadErrorState>

    <UButton
      v-if="!isDesktop"
      icon="i-lucide-plus"
      color="primary"
      size="xl"
      aria-label="Add food"
      class="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] size-14 rounded-full shadow-lg"
      :ui="{ base: 'justify-center' }"
      @click="
        () => {
          open = true
        }
      "
    />

    <AddSheet v-model:open="open" :foods="foods ?? []" />

    <DeleteFoodConfirm :food="selectedFood" @close="selectedFood = null" />

    <ManageTagsSheet v-model:open="manageTagsOpen" />

    <EditFoodSheet
      :food="foodToEdit"
      :tracks-calories="tracksCalories"
      @close="foodIdToEdit = null"
    />

    <RecipeCompositionSheet
      :recipe="recipeToOpen?.recipe ?? null"
      :foods="foods ?? []"
      :edit="recipeToOpen?.edit"
      @close="recipeToOpen = null"
    />
  </section>
</template>
