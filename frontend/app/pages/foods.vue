<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

import { addDemoFood } from '~/prototype/foodTagsDemo'

type FoodResponse = components['schemas']['FoodResponse']

const { data: foods, error: foodsError, refresh } = await useApi('/api/foods')

// PROTOTYPE — Tags on the catalog, over the in-memory demo catalog /log's
// variants read. Dev builds only, on `?variant=tags`.
const protoMode = computed(
  () => import.meta.dev && useRoute().query.variant === 'tags',
)
const protoTags = ref<string[]>([])
provide(
  'prototypeTags',
  computed(() => (protoMode.value ? protoTags : null)).value,
)

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
// The recipe whose row's view button was tapped — non-null opens the read-only
// composition sheet.
const recipeToView = ref<FoodResponse | null>(null)
const isDesktop = useIsDesktop()
const { $api } = useNuxtApp()
const toast = useToast()

watch(open, (isOpen) => {
  if (!isOpen) {
    createdIngredient.value = null
    // The hand-off is spent once the sheet closes; left in the URL it reopens
    // the sheet on a reload, over a catalog the User has since stocked.
    if (opensAddSheet(route.query)) {
      const { add: _spent, ...rest } = route.query
      router.replace({ query: rest })
    }
  }
})

/** Which opening of the Add sheet is on screen; a reopen starts a new one. */
const sheetSession = ref(0)
watch(open, (isOpen) => {
  if (isOpen) sheetSession.value++
})

/**
 * A catalog save, closing the sheet it was issued from — and only that one,
 * which is what `sheetSession` is for: a save resolves whenever it resolves,
 * and on a slow connection that can be after the User gave up on it, dismissed
 * the sheet and opened a fresh one. Closing *that* sheet would take a half-typed
 * Recipe with it.
 *
 * The sheet closing is the confirmation, as the vanishing row is for a delete
 * (ADR 0005) — it closes on success alone, a failure leaving it open under a
 * Retry toast.
 */
async function savingFromThisSheet<T>(save: Promise<T>): Promise<T> {
  const issuedIn = sheetSession.value
  const saved = await save
  if (sheetSession.value === issuedIn) open.value = false
  return saved
}

const { execute: realSubmit } = useApiMutation(
  (payload: {
    name: string
    barcode?: string
    proteinPer100g: number
    carbsPer100g: number
    fatPer100g: number
  }) =>
    savingFromThisSheet($api('/api/foods', { method: 'POST', body: payload })),
  {
    errorTitle: 'Could not add food',
    // The catalog is re-read rather than appended to, because its order is the
    // server's.
    onSuccess: () => refresh(),
  },
)

function handleSubmit(payload: {
  name: string
  barcode?: string
  proteinPer100g: number
  carbsPer100g: number
  fatPer100g: number
}) {
  if (!protoMode.value) return realSubmit(payload)
  addDemoFood({
    name: payload.name,
    kind: 'FOOD',
    caloriesPer100g:
      4 * payload.proteinPer100g +
      4 * payload.carbsPer100g +
      9 * payload.fatPer100g,
    proteinPer100g: payload.proteinPer100g,
    tags: [...protoTags.value],
  })
  protoTags.value = []
  open.value = false
}

// A new Food created inline from the recipe builder's "Add a new food". The page
// owns catalog mutations, so it persists here and refreshes the catalog; the
// created Food flows back down to the builder, which selects it (F9 #142).
const createdIngredient = ref<FoodResponse | null>(null)
const { execute: handleCreateIngredient } = useApiMutation(
  async (payload: {
    name: string
    barcode?: string
    proteinPer100g: number
    carbsPer100g: number
    fatPer100g: number
  }) => {
    createdIngredient.value = await $api('/api/foods', {
      method: 'POST',
      body: payload,
    })
  },
  {
    errorTitle: 'Could not add food',
    onSuccess: () => refresh(),
  },
)

// A Recipe is a composite Food (kind = RECIPE); the backend rolls up its
// nutrition and returns a FoodResponse, so it appears in the catalog exactly
// like a plain Food (F9 #142).
const { pending: recipePending, execute: handleSubmitRecipe } = useApiMutation(
  (payload: {
    name: string
    cookedWeightG: number
    ingredients: { foodId: number; grams: number }[]
  }) =>
    savingFromThisSheet(
      $api('/api/recipes', { method: 'POST', body: payload }),
    ),
  {
    errorTitle: 'Could not add recipe',
    onSuccess: () => refresh(),
  },
)

// Editing a recipe recalibrates it in place (PUT keeps the same Food id), so
// logged Entries still resolve and their snapshots stand — only future logs see
// the new density (F9 #144, ADR 0019). Save closes the view sheet and refreshes
// the catalog so the row reflects the new per-100g.
const { pending: recipeEditPending, execute: handleEditRecipe } =
  useApiMutation(
    (payload: {
      name: string
      cookedWeightG: number
      ingredients: { foodId: number; grams: number }[]
    }) => {
      const id = recipeToView.value!.id
      return $api('/api/recipes/{id}', {
        method: 'PUT',
        path: { id },
        body: payload,
      })
    },
    {
      errorTitle: 'Could not save recipe',
      onSuccess: () => {
        recipeToView.value = null
        return refresh()
      },
    },
  )

// Start each recipe view/edit clean: a Food added inline during a previous edit
// must not resurface when the sheet reopens.
watch(recipeToView, (recipe) => {
  if (!recipe) createdIngredient.value = null
})

const { execute: deleteFood } = useApiMutation(
  (food: FoodResponse) =>
    $api('/api/foods/{id}', { method: 'DELETE', path: { id: food.id } }),
  {
    // No success toast: the row disappears from the list.
    errorTitle: 'Could not delete food',
    onSuccess: () => {
      selectedFood.value = null
      return refresh()
    },
    // A Food with logged Entries can't be deleted (issue #107): the backend
    // rejects with a 400 naming the Food. Surface that message instead of the
    // transient "check your connection" retry toast — retrying never succeeds.
    // Close the confirm and leave the Food in the catalog.
    onValidationError: (message) => {
      selectedFood.value = null
      toast.add({
        title: 'Could not delete food',
        description: message,
        color: 'error',
        // Assertive and dismissible, but no Retry — the rejection is permanent.
        type: 'foreground',
        duration: Infinity,
        close: true,
        progress: false,
      })
    },
  },
)

/**
 * Changing or clearing what a Food borrows its micronutrients from. The queue on
 * `/review` is the one way *into* a match (ADR 0027), and it stops listing a Food
 * that has one — so the way back out lives here, beside the subline naming it.
 */
const foodToMatch = ref<FoodResponse | null>(null)
const {
  claim: claimMatch,
  clear: clearMatch,
  matching,
  unmatching,
} = useReferenceFoodMatch(foodToMatch, refresh)

function handleDeleteConfirm() {
  const food = selectedFood.value
  if (food) deleteFood(food)
}
</script>

<template>
  <section class="flex flex-col gap-4">
    <header class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-default">Foods</h1>
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
      <PrototypeFoodsWithTags v-if="protoMode" />
      <FoodList
        v-else-if="foods && foods.length > 0"
        :foods="foods"
        :tracks-calories="tracksCalories"
        @delete="selectedFood = $event"
        @view="recipeToView = $event"
        @match="foodToMatch = $event"
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

    <AddSheet
      v-model:open="open"
      :created-ingredient="createdIngredient"
      :foods="foods ?? []"
      :recipe-pending="recipePending"
      @submit="handleSubmit"
      @submit-recipe="handleSubmitRecipe"
      @create-food="handleCreateIngredient"
    />

    <DeleteFoodConfirm
      :food="selectedFood"
      @cancel="selectedFood = null"
      @confirm="handleDeleteConfirm"
    />

    <ReferenceFoodPicker
      :food="foodToMatch"
      :matching="matching"
      :unmatching="unmatching"
      @match="claimMatch"
      @unmatch="clearMatch"
      @close="foodToMatch = null"
    />

    <RecipeCompositionSheet
      :recipe="recipeToView"
      :foods="foods ?? []"
      :pending="recipeEditPending"
      :created-ingredient="createdIngredient"
      @close="recipeToView = null"
      @submit-edit="handleEditRecipe"
      @create-food="handleCreateIngredient"
    />
  </section>
</template>
