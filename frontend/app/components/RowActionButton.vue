<!-- An icon action on a row — edit, delete, or a Recipe's ingredients:
     low-emphasis neutral ghost, muted until hovered, at the 44px tap target
     (DESIGN.md → Component treatments). Name it with an `aria-label` that says
     what it acts on. -->
<script setup lang="ts">
// Stryker disable next-line all: a compiler macro must stay a top-level statement
defineProps<{ action: 'edit' | 'delete' | 'ingredients' }>()

const ICONS = {
  edit: 'i-lucide-pencil',
  delete: 'i-lucide-trash-2',
  ingredients: 'i-lucide-list',
}
</script>

<template>
  <UButton
    :icon="ICONS[action]"
    color="neutral"
    variant="ghost"
    class="size-11 shrink-0 text-muted hover:text-default"
    :ui="{ base: 'justify-center' }"
  />
</template>
