<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type FoodResponse = components['schemas']['FoodResponse']

/**
 * `tracksCalories` gates the borrow, which the page resolves from the Profile
 * rather than this row inferring it from whether a match happens to be set:
 * a weight-only User who matched foods before turning tracking off would
 * otherwise keep the whole surface (ADR 0027).
 */
// Stryker disable all: a compiler macro's arguments are hoisted out of setup()
const props = withDefaults(
  defineProps<{ food: FoodResponse; tracksCalories?: boolean }>(),
  { tracksCalories: true },
)
// Stryker restore all
const emit = defineEmits<{
  log: [FoodResponse]
  delete: [FoodResponse]
  view: [FoodResponse]
  match: [FoodResponse]
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

        <!-- What this Food borrows its micronutrients from, named rather than
             ticked: a tick is unverifiable, and there is nothing on an unmatched
             row at all — a marker there would decorate a Food with a status it
             did not earn (ADR 0027). -->
        <p
          v-if="tracksCalories && food.referenceFoodName"
          class="mt-0.5 truncate text-xs text-dimmed"
        >
          Vitamins and minerals from {{ food.referenceFoodName }}
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

    <!-- The way back out of a match. The queue on /review is the one way *in*
         (ADR 0027), and it no longer lists a Food that has one — so changing or
         clearing it lives beside the subline that names it. -->
    <UButton
      v-if="tracksCalories && food.referenceFoodName"
      :aria-label="`Change what ${food.name} borrows vitamins and minerals from`"
      icon="i-lucide-pencil"
      color="neutral"
      variant="ghost"
      square
      class="size-11 shrink-0 text-muted hover:text-default"
      :ui="{ base: 'justify-center' }"
      @click="emit('match', props.food)"
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
