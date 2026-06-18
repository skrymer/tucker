<script setup lang="ts">
import { z } from 'zod'
import type { components } from '#open-fetch-schemas/api'
import type { BudgetWarning } from '~/composables/useBudgetGate'

type FoodResponse = components['schemas']['FoodResponse']

const schema = z.object({
  foodId: z.number({ error: 'Select a food from the list' }),
  grams: gramsSchema,
})

const props = defineProps<{
  date: string
  foods: FoodResponse[]
  /** Over-budget heads-up for the entry being composed; null/absent when within budget. */
  warning?: BudgetWarning | null
  /** True while the budget projection is in flight, to lock the action. */
  pending?: boolean
}>()

const emit = defineEmits<{
  submit: [{ date: string; foodId: number; grams: number }]
  edited: []
}>()

const state = reactive({
  foodId: undefined as number | undefined,
  grams: undefined as number | undefined,
})

// Editing the food or grams clears any showing budget warning so the next Save
// re-checks against the new numbers (no stale "Log anyway").
watch(
  () => [state.foodId, state.grams],
  () => emit('edited'),
)

const warningMessage = computed(() =>
  props.warning
    ? `This puts you ~${Math.round(props.warning.overByKcal)} kcal over your ${Math.round(props.warning.calorieBudget)} budget.`
    : null,
)

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
        :search-input="{ inputmode: 'none' }"
        class="w-full"
      />
    </UFormField>

    <UFormField label="Grams" name="grams" required>
      <UInputNumber v-model="state.grams" :step="1" class="w-full" />
    </UFormField>

    <UAlert
      v-if="warningMessage"
      color="warning"
      variant="soft"
      icon="i-lucide-triangle-alert"
      :title="warningMessage"
    />

    <UButton type="submit" color="primary" class="w-full" :loading="pending">
      {{ warningMessage ? 'Log anyway' : 'Log weighed entry' }}
    </UButton>
  </UForm>
</template>
