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
// The recipe whose row's view button was tapped — non-null opens the read-only
// composition sheet.
const recipeToView = ref<FoodResponse | null>(null)
const isDesktop = useIsDesktop()

// The hand-off is spent once the sheet closes; left in the URL it reopens the
// sheet on a reload, over a catalog the User has since stocked.
watch(open, (isOpen) => {
  if (isOpen || !opensAddSheet(route.query)) return
  const { add: _spent, ...rest } = route.query
  router.replace({ query: rest })
})

/**
 * Changing or clearing what a Food borrows its micronutrients from. The queue on
 * `/review` is the one way *into* a match (ADR 0027), and it stops listing a Food
 * that has one — so the way back out lives here, beside the subline naming it.
 */
const foodToMatch = ref<FoodResponse | null>(null)

/** The Food whose Tags are being set (ADR 0033) — non-null opens its sheet. */
const foodToTag = ref<FoodResponse | null>(null)

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
        @view="recipeToView = $event"
        @match="foodToMatch = $event"
        @tag="foodToTag = $event"
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

    <ReferenceFoodPicker :food="foodToMatch" @close="foodToMatch = null" />

    <ManageTagsSheet v-model:open="manageTagsOpen" />

    <FoodTagsSheet :food="foodToTag" @close="foodToTag = null" />

    <RecipeCompositionSheet
      :recipe="recipeToView"
      :foods="foods ?? []"
      @close="recipeToView = null"
    />
  </section>
</template>
