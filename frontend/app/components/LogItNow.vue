<script setup lang="ts">
import { z } from 'zod'
import type { components } from '#open-fetch-schemas/api'

type FoodResponse = components['schemas']['FoodResponse']

const props = defineProps<{
  food: FoodResponse
  origin: 'created' | 'existing'
}>()

const emit = defineEmits<{
  log: [{ foodId: number; grams: number }]
  dismiss: []
}>()

const schema = z.object({
  grams: z
    .number({ error: 'Enter the weight in grams' })
    .positive('Grams must be greater than 0'),
})

const state = reactive({ grams: undefined as number | undefined })

function onSubmit() {
  emit('log', { foodId: props.food.id, grams: state.grams! })
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
      v-if="origin === 'created'"
      icon="i-lucide-check"
      color="success"
      variant="subtle"
      title="Saved to your catalog"
      :description="food.name"
    />
    <UAlert
      v-else
      icon="i-lucide-check"
      color="success"
      variant="subtle"
      title="Already in your catalog"
      :description="food.name"
    />

    <UFormField label="Grams" name="grams" required>
      <UInputNumber v-model="state.grams" :step="1" class="w-full" />
    </UFormField>

    <UButton type="submit" color="primary" class="w-full"> Log it now </UButton>
    <UButton
      type="button"
      color="neutral"
      variant="ghost"
      class="w-full"
      @click="emit('dismiss')"
    >
      Not now
    </UButton>
  </UForm>
</template>
