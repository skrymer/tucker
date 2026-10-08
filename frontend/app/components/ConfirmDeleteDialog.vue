<script setup lang="ts">
// The confirm before a delete: what goes, in the body slot, then Cancel and a
// destructive Delete. Dismissing the dialog is a Cancel.
defineProps<{ open: boolean; title: string }>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()
</script>

<template>
  <UModal
    :open="open"
    :title="title"
    @update:open="(value) => !value && emit('cancel')"
  >
    <template #body>
      <p class="text-sm text-default"><slot /></p>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" @click="emit('cancel')">Cancel</UButton>
        <UButton color="error" @click="emit('confirm')">Delete</UButton>
      </div>
    </template>
  </UModal>
</template>
