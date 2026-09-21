<!--
  A name, and beneath it in quieter type what that thing cost and returned — the
  one shape every list of Foods and Entries states its figures in
  (frontend/DESIGN.md → Component treatments).

  `formatName` is applied here rather than by each caller, so no surface can opt
  out of Tucker's one voice for case.

  `lead` and `marker` sit on the name's own line — a ring's hue before it, a badge
  or count after it — and the default slot adds lines under the figures. What sits
  at the far end of the row is the caller's own: only it knows whether the row is
  a button, and whether that end holds a share, a weight or an action.
-->
<script setup lang="ts">
// Stryker disable next-line all: a compiler macro must stay a top-level statement
defineProps<{ name: string; figures: string }>()
</script>

<template>
  <span class="block min-w-0">
    <span class="flex items-baseline gap-1.5 font-medium text-default">
      <slot name="lead" />
      <span class="truncate">{{ formatName(name) }}</span>
      <slot name="marker" />
    </span>
    <span class="block text-sm text-muted">{{ figures }}</span>
    <slot />
  </span>
</template>
