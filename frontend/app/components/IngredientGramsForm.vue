<script setup lang="ts">
// Weighing a recipe ingredient: a new line, or an existing one reweighed in
// place. Zod is the single source of truth for the grams field (ADR 0003).
import { z } from 'zod'
import type { components } from '#open-fetch-schemas/api'

const props = defineProps<{
  food: components['schemas']['FoodResponse']
  /** The line's current weight when reweighing one; absent for a new line. */
  grams?: number
  /** Reweighing an existing line, which offers Update and Remove. */
  editing: boolean
}>()
const emit = defineEmits<{
  back: []
  confirm: [grams: number]
  remove: []
}>()

const schema = z.object({ grams: gramsSchema })
const state = reactive({ grams: props.grams })
const presets = [50, 100, 150, 200]
</script>

<template>
  <UForm
    :state="state"
    :schema="schema"
    class="flex flex-col gap-4"
    @submit="(event) => emit('confirm', event.data.grams)"
  >
    <UButton
      icon="i-lucide-arrow-left"
      color="neutral"
      variant="ghost"
      type="button"
      class="self-start"
      @click="emit('back')"
    >
      Back
    </UButton>
    <p class="font-medium text-default">{{ formatName(food.name) }}</p>

    <UFormField label="Grams" name="grams" required>
      <NumberField v-model="state.grams" :min="0" :step="1" class="w-full" />
    </UFormField>

    <div class="flex flex-wrap gap-2">
      <UButton
        v-for="preset in presets"
        :key="preset"
        type="button"
        size="sm"
        color="neutral"
        variant="subtle"
        @click="state.grams = preset"
      >
        {{ preset }} g
      </UButton>
    </div>

    <p v-if="state.grams" class="text-sm text-muted">
      Adds
      {{ Math.round(contribution(food.caloriesPer100g, state.grams)) }}
      kcal
    </p>

    <UButton v-if="!editing" type="submit" color="primary" block>Add</UButton>
    <template v-else>
      <UButton type="submit" color="primary" block>Update</UButton>
      <UButton
        type="button"
        color="error"
        variant="ghost"
        block
        @click="emit('remove')"
      >
        Remove
      </UButton>
    </template>
  </UForm>
</template>
