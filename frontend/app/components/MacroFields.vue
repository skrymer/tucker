<!--
  A Food's three macros per 100 g, side by side, and its fibre beneath them. A
  number field commits its value only on blur, so each keystroke is reported
  apart from the commit.
-->
<script setup lang="ts">
// Stryker disable next-line all: a compiler macro must stay a top-level statement
defineProps<{ values: Record<FoodFigure, number | null | undefined> }>()
// Stryker disable next-line all: a compiler macro must stay a top-level statement
const emit = defineEmits<{
  type: [figure: FoodFigure, event: Event]
  commit: [figure: FoodFigure, value: number | undefined]
}>()
</script>

<template>
  <div class="grid grid-cols-3 gap-3">
    <UFormField
      v-for="figure in FOOD_FIGURES"
      :key="figure"
      :label="MACRO_LABELS[figure]"
      :name="figure"
      :required="figure !== 'fibrePer100g'"
      :hint="figure === 'fibrePer100g' ? 'optional' : undefined"
    >
      <NumberField
        :model-value="values[figure]"
        :min="0"
        :step="0.1"
        class="w-full"
        @input="emit('type', figure, $event)"
        @update:model-value="emit('commit', figure, $event)"
      />
    </UFormField>
  </div>
</template>
