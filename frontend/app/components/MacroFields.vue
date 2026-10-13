<!--
  A Food's three macros per 100 g, side by side. A number field commits its value
  only on blur, so each keystroke is reported apart from the commit.
-->
<script setup lang="ts">
// Stryker disable next-line all: a compiler macro must stay a top-level statement
defineProps<{ values: Record<Macro, number | undefined> }>()
// Stryker disable next-line all: a compiler macro must stay a top-level statement
const emit = defineEmits<{
  type: [macro: Macro, event: Event]
  commit: [macro: Macro, value: number | undefined]
}>()
</script>

<template>
  <div class="grid grid-cols-3 gap-3">
    <UFormField
      v-for="macro in MACROS"
      :key="macro"
      :label="MACRO_LABELS[macro]"
      :name="macro"
      required
    >
      <NumberField
        :model-value="values[macro]"
        :min="0"
        :step="0.1"
        class="w-full"
        @input="emit('type', macro, $event)"
        @update:model-value="emit('commit', macro, $event)"
      />
    </UFormField>
  </div>
</template>
