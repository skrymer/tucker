<script setup lang="ts">
import { z } from 'zod'
import type { BudgetWarning } from '~/composables/useBudgetGate'

const props = defineProps<{
  date: string
  /** Over-budget heads-up for the entry being composed; null/absent when within budget. */
  warning?: BudgetWarning | null
  /** True while the budget projection is in flight, to lock the action. */
  pending?: boolean
}>()

const emit = defineEmits<{
  submit: [
    {
      date: string
      label: string
      calories: number
      protein?: number
    },
  ]
  edited: []
}>()

const warningMessage = computed(() => formatBudgetWarning(props.warning))

const schema = z.object({
  label: z.string().min(1, 'Enter a label for this entry'),
  calories: z.number({ error: 'Enter an estimated calorie figure' }),
  protein: z.number().optional(),
})

const state = reactive({
  label: '',
  calories: undefined as number | undefined,
  protein: undefined as number | undefined,
})

// Editing any field clears a showing budget warning so the next Save re-checks
// against the new numbers (no stale "Log anyway").
watch(
  () => [state.label, state.calories, state.protein],
  () => emit('edited'),
)

function onSubmit() {
  emit('submit', {
    date: props.date,
    label: state.label,
    calories: state.calories!,
    protein: state.protein,
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
    <UFormField label="Label" name="label" required>
      <UInput
        v-model="state.label"
        placeholder="e.g. Lunch at restaurant"
        class="w-full"
      />
    </UFormField>

    <UFormField label="Calories" name="calories" required>
      <UInputNumber
        v-model="state.calories"
        :min="1"
        :step="1"
        class="w-full"
      />
    </UFormField>

    <UFormField label="Protein (optional)" name="protein">
      <UInputNumber v-model="state.protein" :min="0" :step="1" class="w-full" />
    </UFormField>

    <UAlert
      v-if="warningMessage"
      color="warning"
      variant="soft"
      icon="i-lucide-triangle-alert"
      :title="warningMessage"
    />

    <UButton type="submit" color="primary" class="w-full" :loading="pending">
      {{ warningMessage ? 'Log anyway' : 'Log estimated entry' }}
    </UButton>
  </UForm>
</template>
