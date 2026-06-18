<script setup lang="ts">
defineProps<{ date: string; open: boolean }>()

const emit = defineEmits<{ logged: []; 'update:open': [boolean] }>()

const { $api } = useNuxtApp()

// Foods catalog for the Weighed form. Non-awaited so the component
// renders immediately; the picker populates when the fetch resolves.
// In tests without a backend the fetch silently rejects and `foods`
// stays null — the Weighed form just shows the empty-catalog CTA.
const { data: foods } = useApi('/api/foods')

function closeAndEmit() {
  emit('update:open', false)
  emit('logged')
}

const { pending: submittingEstimated, execute: handleSubmitEstimated } =
  useApiMutation(
    (payload: {
      date: string
      label: string
      calories: number
      protein?: number
    }) => $api('/api/entries/estimated', { method: 'POST', body: payload }),
    {
      // Kept: the sheet closes back to Today, where the calorie/protein delta
      // may be scrolled off-screen — the toast bridges "sheet closed → it worked".
      successTitle: 'Entry logged',
      errorTitle: 'Could not save entry',
      onSuccess: closeAndEmit,
    },
  )

const { pending: submittingWeighed, execute: handleSubmitWeighed } =
  useApiMutation(
    (payload: { date: string; foodId: number; grams: number }) =>
      $api('/api/entries/weighed', { method: 'POST', body: payload }),
    {
      // Kept for the same reason as the estimated entry above.
      successTitle: 'Entry logged',
      errorTitle: 'Could not save entry',
      onSuccess: closeAndEmit,
    },
  )

// Confirm-to-proceed gate (CONTEXT.md — Budget Projection): a weighed Save first
// previews against the Calorie Budget; within budget it commits, over budget it
// raises a warning and the next deliberate tap logs anyway. Editing the form resets
// it; a failed preview fails open and logs anyway.
const {
  warning: weighedWarning,
  pending: weighedProjecting,
  attempt: attemptWeighed,
  reset: resetWeighed,
} = useBudgetGate({
  preview: (payload: { date: string; foodId: number; grams: number }) =>
    $api('/api/entries/weighed/preview', { method: 'POST', body: payload }),
  commit: handleSubmitWeighed,
})

// Any submit or projection in flight locks the sheet against dismissal mid-request.
const submitting = computed(
  () =>
    submittingEstimated.value ||
    submittingWeighed.value ||
    weighedProjecting.value,
)
</script>

<template>
  <ResponsiveOverlay
    :open="open"
    title="Log entry"
    :dismissible="!submitting"
    @update:open="(value) => emit('update:open', value)"
  >
    <LogEntryBody
      :date="date"
      :foods="foods ?? []"
      :weighed-warning="weighedWarning"
      :weighed-pending="weighedProjecting || submittingWeighed"
      @submit-estimated="handleSubmitEstimated"
      @submit-weighed="attemptWeighed"
      @edited-weighed="resetWeighed"
    />
  </ResponsiveOverlay>
</template>
