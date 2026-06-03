<script setup lang="ts">
defineProps<{ date: string }>()

const emit = defineEmits<{ logged: [] }>()

const open = ref(false)
const { $api } = useNuxtApp()

// Foods catalog for the Weighed form. Non-awaited so the component
// renders immediately; the picker populates when the fetch resolves.
// In tests without a backend the fetch silently rejects and `foods`
// stays null — the Weighed form just shows the empty-catalog CTA.
const { data: foods } = useApi('/api/foods')

function closeAndEmit() {
  open.value = false
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

// Either submit in flight locks the sheet against dismissal mid-request.
const submitting = computed(
  () => submittingEstimated.value || submittingWeighed.value,
)
</script>

<template>
  <UButton color="primary" icon="i-lucide-plus" block @click="open = true">
    Log entry
  </UButton>

  <ResponsiveOverlay
    v-model:open="open"
    title="Log entry"
    :dismissible="!submitting"
  >
    <LogEntryBody
      :date="date"
      :foods="foods ?? []"
      @submit-estimated="handleSubmitEstimated"
      @submit-weighed="handleSubmitWeighed"
    />
  </ResponsiveOverlay>
</template>
