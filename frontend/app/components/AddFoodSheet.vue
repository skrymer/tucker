<script setup lang="ts">
defineProps<{ open: boolean }>()

const emit = defineEmits<{
  'update:open': [boolean]
  submit: [
    {
      name: string
      proteinPer100g: number
      carbsPer100g: number
      fatPer100g: number
    },
  ]
}>()
</script>

<template>
  <ResponsiveOverlay
    :open="open"
    title="Add food"
    @update:open="(value) => emit('update:open', value)"
  >
    <AddFoodForm @submit="(payload) => emit('submit', payload)" />
  </ResponsiveOverlay>
</template>
