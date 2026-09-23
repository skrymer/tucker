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
  delete: [FoodResponse]
  view: [FoodResponse]
  match: [FoodResponse]
  tag: [FoodResponse]
}>()

const tags = computed(() => rowTags(props.food.tags ?? []))

const isRecipe = computed(() => props.food.kind === 'RECIPE')

const name = computed(() => formatName(props.food.name))

// The recipe row's meta subline, e.g. "5 ingredients · makes 1,400 g".
const recipeSubline = computed(() => {
  const count = props.food.ingredientCount ?? 0
  const noun = count === 1 ? 'ingredient' : 'ingredients'
  return `${count} ${noun} · makes ${formatGrams(props.food.cookedWeightG ?? 0)}`
})
</script>

<template>
  <!-- The row body states the Food and takes no tap of its own — logging is its
       own destination (ADR 0028). Beside it the list icon views a recipe's
       composition, the pencil changes a borrow and the trash deletes. -->
  <div class="flex items-center gap-1">
    <div class="min-w-0 flex-1 py-3">
      <FigureRow :name="food.name" :figures="formatPer100g(food)">
        <template #marker>
          <RecipeBadge v-if="isRecipe" />
        </template>

        <!-- Recipe-only meta line, quieter than the nutrition line. -->
        <span v-if="isRecipe" class="mt-0.5 block text-xs text-dimmed">
          {{ recipeSubline }}
        </span>

        <!-- What this Food borrows its micronutrients from, named rather than
             ticked: a tick is unverifiable, and there is nothing on an unmatched
             row at all — a marker there would decorate a Food with a status it
             did not earn (ADR 0027). -->
        <span
          v-if="tracksCalories && food.referenceFoodName"
          class="mt-0.5 block truncate text-xs text-dimmed"
        >
          Vitamins and minerals from {{ food.referenceFoodName }}
        </span>
      </FigureRow>

      <!-- Tags are the User's words, spelled as given; the +N opens the same
           sheet as the tag action (ADR 0033). -->
      <ul
        v-if="tags.shown.length"
        :aria-label="`Tags on ${name}`"
        class="mt-1 flex flex-wrap gap-1"
      >
        <li v-for="tag in tags.shown" :key="tag.id">
          <UBadge :label="tag.name" color="neutral" variant="soft" size="sm" />
        </li>
        <li v-if="tags.hidden > 0">
          <button
            type="button"
            :aria-label="`${tags.hidden} more tags on ${name}`"
            class="rounded-full"
            @click="emit('tag', props.food)"
          >
            <UBadge
              :label="`+${tags.hidden}`"
              color="neutral"
              variant="outline"
              size="sm"
            />
          </button>
        </li>
      </ul>
    </div>

    <UButton
      v-if="isRecipe"
      :aria-label="`View ingredients in ${name}`"
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
      :aria-label="`Change what ${name} borrows vitamins and minerals from`"
      icon="i-lucide-pencil"
      color="neutral"
      variant="ghost"
      square
      class="size-11 shrink-0 text-muted hover:text-default"
      :ui="{ base: 'justify-center' }"
      @click="emit('match', props.food)"
    />

    <UButton
      :aria-label="`Tags for ${name}`"
      icon="i-lucide-tag"
      color="neutral"
      variant="ghost"
      square
      class="size-11 shrink-0 text-muted hover:text-default"
      :ui="{ base: 'justify-center' }"
      @click="emit('tag', props.food)"
    />

    <UButton
      :aria-label="`Delete ${name}`"
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
