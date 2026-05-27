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

const isDesktop = useIsDesktop()
</script>

<template>
  <UDrawer
    v-if="!isDesktop"
    :open="open"
    direction="bottom"
    title="Add food"
    @update:open="(value) => emit('update:open', value)"
  >
    <template #body>
      <AddFoodForm @submit="(payload) => emit('submit', payload)" />
    </template>
  </UDrawer>

  <UModal
    v-else
    :open="open"
    title="Add food"
    @update:open="(value) => emit('update:open', value)"
  >
    <template #body>
      <AddFoodForm @submit="(payload) => emit('submit', payload)" />
    </template>
  </UModal>
</template>
