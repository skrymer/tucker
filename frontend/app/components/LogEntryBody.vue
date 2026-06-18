<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'
import type { components } from '#open-fetch-schemas/api'
import type { BudgetWarning } from '~/composables/useBudgetGate'

type FoodResponse = components['schemas']['FoodResponse']

defineProps<{
  date: string
  foods: FoodResponse[]
  /** Over-budget warning for the estimated entry being composed; null when within budget. */
  estimatedWarning?: BudgetWarning | null
  /** True while the estimated entry's budget projection is in flight. */
  estimatedPending?: boolean
  /** Over-budget warning for the weighed entry being composed; null when within budget. */
  weighedWarning?: BudgetWarning | null
  /** True while the weighed entry's budget projection is in flight. */
  weighedPending?: boolean
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
  editedEstimated: []
  editedWeighed: []
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
        :warning="estimatedWarning"
        :pending="estimatedPending"
        class="mt-4"
        @submit="(payload) => emit('submitEstimated', payload)"
        @edited="() => emit('editedEstimated')"
      />
    </template>

    <template #weighed>
      <WeighedEntryForm
        :date="date"
        :foods="foods"
        :warning="weighedWarning"
        :pending="weighedPending"
        class="mt-4"
        @submit="(payload) => emit('submitWeighed', payload)"
        @edited="() => emit('editedWeighed')"
      />
    </template>
  </UTabs>
</template>
