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
  /**
   * Set to the Provider's name when a barcode candidate has seeded the form, so
   * the user knows the fields were pre-filled and can edit any that are off
   * (ADR 0007 — the fill is shown inline, not as a toast).
   */
  filledFromSource?: string
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

// A barcode look-up resolves asynchronously and re-seeds the form (ADR 0007).
// The form is never remounted — it merges the candidate's values into the
// fields the user hasn't touched, so a slow look-up can't wipe what they typed.
const touched = reactive({
  name: false,
  proteinPer100g: false,
  carbsPer100g: false,
  fatPer100g: false,
})
function markTouched(field: keyof typeof touched) {
  touched[field] = true
}
watch(
  () => props.initial,
  (next) => {
    if (!next) return
    if (next.name != null && !touched.name) state.name = next.name
    if (next.proteinPer100g != null && !touched.proteinPer100g)
      state.proteinPer100g = next.proteinPer100g
    if (next.carbsPer100g != null && !touched.carbsPer100g)
      state.carbsPer100g = next.carbsPer100g
    if (next.fatPer100g != null && !touched.fatPer100g)
      state.fatPer100g = next.fatPer100g
  },
)

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
    <UAlert
      v-if="filledFromSource"
      icon="i-lucide-sparkles"
      color="neutral"
      variant="subtle"
      :title="`Filled from ${filledFromSource}`"
      description="Review the values and edit anything that's off."
    />

    <UFormField label="Name" name="name" required>
      <UInput
        v-model="state.name"
        placeholder="e.g. Skyr 1.5%"
        class="w-full"
        @update:model-value="markTouched('name')"
      />
    </UFormField>

    <div class="grid grid-cols-3 gap-3">
      <UFormField label="Protein /100g" name="proteinPer100g" required>
        <UInputNumber
          v-model="state.proteinPer100g"
          :min="0"
          :step="0.1"
          class="w-full"
          @update:model-value="markTouched('proteinPer100g')"
        />
      </UFormField>
      <UFormField label="Carbs /100g" name="carbsPer100g" required>
        <UInputNumber
          v-model="state.carbsPer100g"
          :min="0"
          :step="0.1"
          class="w-full"
          @update:model-value="markTouched('carbsPer100g')"
        />
      </UFormField>
      <UFormField label="Fat /100g" name="fatPer100g" required>
        <UInputNumber
          v-model="state.fatPer100g"
          :min="0"
          :step="0.1"
          class="w-full"
          @update:model-value="markTouched('fatPer100g')"
        />
      </UFormField>
    </div>

    <p v-if="statedEnergyKcalPer100g != null" class="text-sm text-muted">
      Stated on the label: {{ statedEnergyKcalPer100g }} kcal /100 g. Calories
      are recalculated from the macros above.
    </p>

    <!-- Optional content (e.g. a barcode pre-fill) sits between the fields and
         Save, so a scanned result lands right above the Save button. -->
    <slot />

    <UButton type="submit" color="primary" class="w-full"> Save food </UButton>
  </UForm>
</template>
