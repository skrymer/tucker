<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'
import type { Matchable } from './ReferenceFoodPicker.vue'

// Stryker disable next-line all: a compiler macro's arguments are hoisted out of setup()
const props = defineProps<{ food: components['schemas']['FoodResponse'] }>()

const name = computed(() => formatName(props.food.name))

/**
 * The Food as the catalog holds it now: a Clear takes effect at once, outside
 * the sheet's draft, so the match is read back from the catalog it re-reads
 * rather than from the Food the sheet opened on.
 */
const { data: catalog } = useFoodCatalog()
const current = computed(
  () => catalog.value?.find((food) => food.id === props.food.id) ?? props.food,
)

/** The Food whose match is being cleared; the answer settles it back to null. */
const clearing = ref<{ id: number } | null>(null)
const { clear, unmatching } = useReferenceFoodMatch(
  clearing,
  refreshFoodCatalog,
)
function clearMatch() {
  clearing.value = current.value
  clear()
}

/** The Food a new match is being picked for — non-null opens the picker. */
const matching = ref<Matchable | null>(null)
</script>

<template>
  <div
    v-if="current.referenceFoodName"
    class="flex items-center justify-between gap-3 rounded-inset bg-elevated/50 px-3 py-2"
  >
    <p class="min-w-0 text-sm text-muted">
      Vitamins and minerals from {{ current.referenceFoodName }}
    </p>
    <div class="flex shrink-0 gap-1">
      <UButton
        label="Change"
        :aria-label="`Change what ${name} borrows vitamins and minerals from`"
        color="neutral"
        variant="subtle"
        class="min-h-11"
        @click="matching = current"
      />
      <UButton
        label="Clear"
        :aria-label="`Clear what ${name} borrows vitamins and minerals from`"
        color="neutral"
        variant="subtle"
        class="min-h-11"
        :loading="unmatching"
        @click="clearMatch"
      />
    </div>
  </div>

  <ReferenceFoodPicker :food="matching" @close="matching = null" />
</template>
