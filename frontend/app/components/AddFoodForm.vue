<script setup lang="ts">
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(1, 'Enter a name for this food'),
  proteinPer100g: z.number({ error: 'Enter protein per 100 g' }),
  carbsPer100g: z.number({ error: 'Enter carbs per 100 g' }),
  fatPer100g: z.number({ error: 'Enter fat per 100 g' }),
})

const props = defineProps<{
  /**
   * Seed values for the form — a barcode-lookup Candidate (name + the macros
   * the Provider supplied; absent ones stay blank) or just a barcode for a miss.
   */
  initial?: {
    name?: string
    barcode?: string
    proteinPer100g?: number
    carbsPer100g?: number
    fatPer100g?: number
  }
  /**
   * A Provider's stated energy per 100 g, shown only as a cross-check — calories
   * are always recalculated from the macros (Atwater). See ADR 0006.
   */
  statedEnergyKcalPer100g?: number
}>()

const emit = defineEmits<{
  submit: [
    {
      name: string
      barcode?: string
      proteinPer100g: number
      carbsPer100g: number
      fatPer100g: number
    },
  ]
}>()

const state = reactive({
  name: props.initial?.name ?? '',
  proteinPer100g: props.initial?.proteinPer100g,
  carbsPer100g: props.initial?.carbsPer100g,
  fatPer100g: props.initial?.fatPer100g,
})

function onSubmit() {
  emit('submit', {
    name: state.name,
    barcode: props.initial?.barcode,
    proteinPer100g: state.proteinPer100g!,
    carbsPer100g: state.carbsPer100g!,
    fatPer100g: state.fatPer100g!,
  })
}
</script>

<template>
  <UForm
    :state="state"
    :schema="schema"
    class="flex flex-col gap-4"
    @submit="onSubmit"
  >
    <UFormField label="Name" name="name" required>
      <UInput
        v-model="state.name"
        autofocus
        placeholder="e.g. Skyr 1.5%"
        class="w-full"
      />
    </UFormField>

    <div class="grid grid-cols-3 gap-3">
      <UFormField label="Protein /100g" name="proteinPer100g" required>
        <UInputNumber
          v-model="state.proteinPer100g"
          :min="0"
          :step="0.1"
          class="w-full"
        />
      </UFormField>
      <UFormField label="Carbs /100g" name="carbsPer100g" required>
        <UInputNumber
          v-model="state.carbsPer100g"
          :min="0"
          :step="0.1"
          class="w-full"
        />
      </UFormField>
      <UFormField label="Fat /100g" name="fatPer100g" required>
        <UInputNumber
          v-model="state.fatPer100g"
          :min="0"
          :step="0.1"
          class="w-full"
        />
      </UFormField>
    </div>

    <p v-if="statedEnergyKcalPer100g != null" class="text-sm text-muted">
      Stated on the label: {{ statedEnergyKcalPer100g }} kcal /100 g. Calories
      are recalculated from the macros above.
    </p>

    <UButton type="submit" color="primary" class="w-full"> Save food </UButton>
  </UForm>
</template>
