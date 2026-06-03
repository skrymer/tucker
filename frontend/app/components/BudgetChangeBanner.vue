<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

const props = defineProps<{
  budgetChange: components['schemas']['BudgetChange'] | null | undefined
}>()

// A dismissed change stays dismissed across reloads, keyed by the review that
// raised it — so a *new* changed review (a new id) shows a fresh banner.
function useBudgetChangeDismissal() {
  const storageKey = computed(() =>
    props.budgetChange
      ? `tucker:budget-change-dismissed:${props.budgetChange.reviewId}`
      : null,
  )

  const dismissed = ref(false)
  watchEffect(() => {
    dismissed.value =
      storageKey.value != null && localStorage.getItem(storageKey.value) != null
  })

  function dismiss() {
    if (storageKey.value) localStorage.setItem(storageKey.value, '1')
    dismissed.value = true
  }

  return { dismissed, dismiss }
}

const { dismissed, dismiss } = useBudgetChangeDismissal()
const visible = computed(() => props.budgetChange != null && !dismissed.value)

const round = (n: number) => Math.round(n)
</script>

<template>
  <UAlert
    v-if="visible && budgetChange"
    icon="i-lucide-trending-up"
    color="primary"
    variant="subtle"
    title="Your weekly review changed your targets"
    close
    :actions="[
      {
        label: 'See your review',
        to: '/review',
        color: 'primary',
        variant: 'subtle',
      },
    ]"
    @update:open="dismiss"
  >
    <template #description>
      <p>
        Calorie Budget: {{ round(budgetChange.previousBudgetKcal) }} →
        {{ round(budgetChange.newBudgetKcal) }} kcal
      </p>
      <p>
        Protein Floor: {{ round(budgetChange.previousFloorG) }} →
        {{ round(budgetChange.newFloorG) }} g
      </p>
    </template>
  </UAlert>
</template>
