<script setup lang="ts">
import { z } from 'zod'
import type { components } from '#open-fetch-schemas/api'

type FoodResponse = components['schemas']['FoodResponse']

const schema = z.object({
  foodId: z.number({ error: 'Select a food from the list' }),
  grams: z
    .number({ error: 'Enter the weight in grams' })
    .positive('Grams must be greater than 0'),
})

const props = defineProps<{
  date: string
  foods: FoodResponse[]
}>()

const emit = defineEmits<{
  submit: [{ date: string; foodId: number; grams: number }]
}>()

const state = reactive({
  foodId: undefined as number | undefined,
  grams: undefined as number | undefined,
})

function onSubmit() {
  emit('submit', {
    date: props.date,
    foodId: state.foodId!,
    grams: state.grams!,
  })
}
</script>

<template>
  <div
    v-if="foods.length === 0"
    class="flex flex-col items-center gap-3 py-8 text-center"
  >
    <UIcon name="i-lucide-salad" class="size-8 text-muted" aria-hidden />
    <p class="text-sm text-muted">No foods in your catalog yet.</p>
    <UButton variant="outline" size="sm" to="/foods">
      Add your first food
    </UButton>
  </div>

  <UForm
    v-else
    :state="state"
    :schema="schema"
    class="flex flex-col gap-4"
    @submit="onSubmit"
  >
    <UFormField label="Food" name="foodId" required>
      <USelectMenu
        v-model="state.foodId"
        :items="foods"
        value-key="id"
        label-key="name"
        placeholder="Select a food"
        class="w-full"
      />
    </UFormField>

    <UFormField label="Grams" name="grams" required>
      <UInputNumber v-model="state.grams" :step="1" class="w-full" />
    </UFormField>

    <UButton type="submit" color="primary" class="w-full">
      Log weighed entry
    </UButton>
  </UForm>
</template>
