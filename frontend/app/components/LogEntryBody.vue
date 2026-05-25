<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'
import type { components } from '#open-fetch-schemas/api'

type FoodResponse = components['schemas']['FoodResponse']

defineProps<{
  date: string
  foods: FoodResponse[]
}>()

const emit = defineEmits<{
  submitEstimated: [
    {
      date: string
      label: string
      calories: number
      protein?: number
    },
  ]
  submitWeighed: [{ date: string; foodId: number; grams: number }]
}>()

const items: TabsItem[] = [
  { value: 'estimated', label: 'Estimated', slot: 'estimated' },
  { value: 'weighed', label: 'Weighed', slot: 'weighed' },
]
</script>

<template>
  <UTabs
    :items="items"
    default-value="estimated"
    color="primary"
    class="w-full"
  >
    <template #estimated>
      <EstimatedEntryForm
        :date="date"
        class="mt-4"
        @submit="(payload) => emit('submitEstimated', payload)"
      />
    </template>

    <template #weighed>
      <WeighedEntryForm
        :date="date"
        :foods="foods"
        class="mt-4"
        @submit="(payload) => emit('submitWeighed', payload)"
      />
    </template>
  </UTabs>
</template>
