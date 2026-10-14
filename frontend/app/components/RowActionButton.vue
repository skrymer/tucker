<!-- An edit or delete icon on a row: low-emphasis neutral ghost, muted until
     hovered, at the 44px tap target (DESIGN.md → Component treatments). Name it
     with an `aria-label` that says what it acts on. -->
<script setup lang="ts">
// Stryker disable next-line all: a compiler macro must stay a top-level statement
defineProps<{ action: 'edit' | 'delete' }>()
</script>

<template>
  <UButton
    :icon="action === 'edit' ? 'i-lucide-pencil' : 'i-lucide-trash-2'"
    color="neutral"
    variant="ghost"
    square
    class="size-11 shrink-0 text-muted hover:text-default"
    :ui="{ base: 'justify-center' }"
  />
</template>
