<script setup lang="ts">
import { z } from 'zod'
import type { components } from '#open-fetch-schemas/api'
import type { BudgetWarning } from '~/composables/useBudgetGate'

type FoodResponse = components['schemas']['FoodResponse']

const props = defineProps<{
  food: FoodResponse | null
  /** Over-budget heads-up for the entry being composed; null/absent when within budget. */
  warning?: BudgetWarning | null
  /** True while the budget projection or the save is in flight, to lock the action. */
  pending?: boolean
}>()

const emit = defineEmits<{
  log: [{ foodId: number; grams: number }]
  edited: []
  close: []
}>()

// Autofocus the grams field on desktop for quick entry, but NOT on phone: there
// the focus pops the on-screen keyboard the instant the sheet opens, which
// covers the controls and makes the sheet hard to dismiss.
const isDesktop = useIsDesktop()

const schema = z.object({ grams: gramsSchema })

const state = reactive({ grams: undefined as number | undefined })

// Reset on every (re)open so a previous session's grams don't linger. The
// form's `:key` remounts the field but not this state, which the number field's
// blur-scoped commit hides from a test that types without leaving the field.
watch(
  () => props.food,
  (food) => {
    if (food) state.grams = undefined
  },
)

// Editing the grams clears any showing budget warning so the next Save
// re-checks against the new number (no stale "Log anyway").
watch(
  () => state.grams,
  () => emit('edited'),
)

const warningMessage = computed(() => formatBudgetWarning(props.warning))

function onSubmit() {
  emit('log', { foodId: props.food!.id, grams: state.grams! })
}
</script>

<template>
  <ResponsiveOverlay
    :open="food !== null"
    :title="food ? `Log ${formatName(food.name)}` : ''"
    @update:open="(value) => !value && emit('close')"
  >
    <!-- Keyed per food so each open mounts a fresh form — a number field keeps
         its rendered text when the model resets to undefined. -->
    <UForm
      :key="food?.id"
      :state="state"
      :schema="schema"
      class="flex flex-col gap-4"
      @submit="onSubmit"
    >
      <UFormField label="Weight (g)" name="grams" required>
        <NumberField
          v-model="state.grams"
          :autofocus="isDesktop"
          :step="1"
          placeholder="e.g. 150"
          class="w-full"
        />
      </UFormField>

      <UAlert
        v-if="warningMessage"
        color="warning"
        variant="soft"
        icon="i-lucide-triangle-alert"
        :title="warningMessage"
      />

      <UButton type="submit" color="primary" class="w-full" :loading="pending">
        {{ warningMessage ? 'Log anyway' : 'Log entry' }}
      </UButton>
    </UForm>
  </ResponsiveOverlay>
</template>
