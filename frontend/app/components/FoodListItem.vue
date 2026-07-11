<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type FoodResponse = components['schemas']['FoodResponse']

const props = defineProps<{ food: FoodResponse }>()
const emit = defineEmits<{
  log: [FoodResponse]
  delete: [FoodResponse]
  view: [FoodResponse]
}>()

const isRecipe = computed(() => props.food.kind === 'RECIPE')

// The recipe row's meta subline, e.g. "5 ingredients · makes 1,400 g".
const recipeSubline = computed(() => {
  const count = props.food.ingredientCount ?? 0
  const noun = count === 1 ? 'ingredient' : 'ingredients'
  return `${count} ${noun} · makes ${formatGrams(props.food.cookedWeightG ?? 0)}`
})
</script>

<template>
  <!-- Sibling controls only (nested buttons are invalid HTML): the row body
       logs the food, the list icon views a recipe's composition, the trash
       icon deletes it. -->
  <div class="flex items-center gap-1">
    <button
      type="button"
      :aria-label="`Log ${food.name}`"
      class="min-w-0 flex-1 rounded-md py-3 text-left hover:bg-elevated active:bg-elevated"
      @click="emit('log', props.food)"
    >
      <div class="min-w-0">
        <div class="flex min-w-0 items-center gap-2">
          <p class="truncate font-medium text-default">{{ food.name }}</p>
          <UBadge
            v-if="isRecipe"
            color="primary"
            variant="subtle"
            size="sm"
            class="shrink-0"
          >
            <UIcon name="i-lucide-cooking-pot" class="size-3" />
            Recipe
          </UBadge>
        </div>

        <!-- Nutrition subline: identical for plain foods and recipes, so a
             recipe reads as "a food, plus more". -->
        <p class="mt-0.5 text-sm text-muted">
          {{ Math.round(food.caloriesPer100g) }} kcal ·
          {{ Math.round(food.proteinPer100g) }} g protein /100g
        </p>

        <!-- Recipe-only meta line, quieter than the nutrition line. -->
        <p v-if="isRecipe" class="mt-0.5 text-xs text-dimmed">
          {{ recipeSubline }}
        </p>
      </div>
    </button>

    <UButton
      v-if="isRecipe"
      :aria-label="`View ingredients in ${food.name}`"
      icon="i-lucide-list"
      color="neutral"
      variant="ghost"
      square
      class="size-11 shrink-0 text-muted hover:text-default"
      :ui="{ base: 'justify-center' }"
      @click="emit('view', props.food)"
    />

    <UButton
      :aria-label="`Delete ${food.name}`"
      icon="i-lucide-trash-2"
      color="neutral"
      variant="ghost"
      square
      class="size-11 shrink-0 text-muted hover:text-default"
      :ui="{ base: 'justify-center' }"
      @click="emit('delete', props.food)"
    />
  </div>
</template>
