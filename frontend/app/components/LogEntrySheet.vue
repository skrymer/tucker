<script setup lang="ts">
// Stryker disable next-line all: a compiler macro must stay a top-level statement
defineProps<{ open: boolean }>()

const emit = defineEmits<{ logged: []; 'update:open': [boolean] }>()

// Foods catalog for the Weighed form. Non-awaited so the component renders
// immediately; the picker populates when the fetch resolves. A failed fetch
// (distinct from a genuinely empty catalog) surfaces as a retryable error on
// the Weighed tab instead of the empty-catalog CTA (issue #139).
const {
  data: foods,
  error: foodsError,
  refresh: refreshFoods,
} = useApi('/api/foods')

function closeAndEmit() {
  emit('update:open', false)
  emit('logged')
}

// Each entry kind gets its own gate, so a warning raised over one is not
// answered by a Save on the other (CONTEXT.md — Budget Projection).
const estimated = useEstimatedEntryLog({ onLogged: closeAndEmit })
const weighed = useWeighedEntryLog({ onLogged: closeAndEmit })
</script>

<template>
  <ResponsiveOverlay
    :open="open"
    title="Log entry"
    @update:open="(value) => emit('update:open', value)"
  >
    <LogEntryBody
      :foods="foods ?? []"
      :foods-error="foodsError"
      :estimated-warning="estimated.warning.value"
      :estimated-pending="estimated.pending.value"
      :weighed-warning="weighed.warning.value"
      :weighed-pending="weighed.pending.value"
      @submit-estimated="estimated.log"
      @submit-weighed="weighed.log"
      @edited-estimated="estimated.reset"
      @edited-weighed="weighed.reset"
      @retry-foods="refreshFoods"
    />
  </ResponsiveOverlay>
</template>
