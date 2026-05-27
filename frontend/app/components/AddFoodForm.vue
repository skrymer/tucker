<script setup lang="ts">
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(1, 'Enter a name for this food'),
  proteinPer100g: z.number({ error: 'Enter protein per 100 g' }),
  carbsPer100g: z.number({ error: 'Enter carbs per 100 g' }),
  fatPer100g: z.number({ error: 'Enter fat per 100 g' }),
})

const emit = defineEmits<{
  submit: [
    {
      name: string
      proteinPer100g: number
      carbsPer100g: number
      fatPer100g: number
    },
  ]
}>()

const state = reactive({
  name: '',
  proteinPer100g: undefined as number | undefined,
  carbsPer100g: undefined as number | undefined,
  fatPer100g: undefined as number | undefined,
})

function onSubmit() {
  emit('submit', {
    name: state.name,
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

    <UButton type="submit" color="primary" class="w-full"> Save food </UButton>
  </UForm>
</template>
