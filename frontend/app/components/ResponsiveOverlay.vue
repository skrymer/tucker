<script setup lang="ts">
defineProps<{ title: string; dismissible?: boolean }>()
const open = defineModel<boolean>('open', { required: true })

// A bottom drawer on phone, a centred modal on desktop — rendered one at a
// time (not both with CSS) so there's a single dialog role and focus trap.
const isDesktop = useIsDesktop()
</script>

<template>
  <UDrawer
    v-if="!isDesktop"
    v-model:open="open"
    direction="bottom"
    :title="title"
    :dismissible="dismissible"
  >
    <template #body><slot /></template>
  </UDrawer>

  <UModal v-else v-model:open="open" :title="title" :dismissible="dismissible">
    <template #body><slot /></template>
  </UModal>
</template>
