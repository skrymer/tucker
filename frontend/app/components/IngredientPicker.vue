<script setup lang="ts">
// Choosing a recipe ingredient: a plain Food from the catalog, or a new one
// added to it on the spot, so a missing ingredient never dead-ends the recipe.
import type { components } from '#open-fetch-schemas/api'

type FoodResponse = components['schemas']['FoodResponse']

const props = defineProps<{ foods: FoodResponse[] }>()
const emit = defineEmits<{
  back: []
  choose: [FoodResponse]
}>()

// Only plain Foods can be ingredients — no nested recipes in v1 (CONTEXT.md).
const pickableFoods = computed(() =>
  props.foods.filter((f) => f.kind === 'FOOD'),
)

/** "Add a new food": created in the catalog, then chosen like any other. */
function useNewFood() {
  const adding = ref(false)
  const { execute: create } = useCreateFood(async (save) =>
    emit('choose', await save),
  )
  return { adding, create }
}
const { adding, create } = useNewFood()
</script>

<template>
  <div v-if="adding" class="flex flex-col gap-3">
    <UButton
      icon="i-lucide-arrow-left"
      color="neutral"
      variant="ghost"
      class="self-start"
      @click="adding = false"
    >
      Back
    </UButton>
    <AddFoodForm @submit="create" />
  </div>

  <div v-else class="flex flex-col gap-3">
    <UButton
      icon="i-lucide-arrow-left"
      color="neutral"
      variant="ghost"
      class="self-start"
      @click="emit('back')"
    >
      Back
    </UButton>
    <UButton
      icon="i-lucide-plus"
      color="primary"
      variant="subtle"
      block
      @click="adding = true"
    >
      Add a new food
    </UButton>

    <ul role="list" class="flex flex-col gap-2">
      <li v-for="food in pickableFoods" :key="food.id">
        <button
          type="button"
          class="flex w-full items-center justify-between gap-3 rounded-lg border border-default px-3 py-2 text-left"
          @click="emit('choose', food)"
        >
          <span class="font-medium text-default">{{
            formatName(food.name)
          }}</span>
          <span class="text-sm text-muted">
            {{ Math.round(food.caloriesPer100g) }} kcal /100g
          </span>
        </button>
      </li>
    </ul>
  </div>
</template>
