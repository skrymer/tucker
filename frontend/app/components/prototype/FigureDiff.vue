<script setup lang="ts">
// PROTOTYPE — `kcal · g protein /100g`, where a figure that moved reads as the
// old one struck through and dimmed, then the new one. Dev builds only.
defineProps<{
  before: { kcal: number; protein: number }
  after: { kcal: number; protein: number }
}>()
const moved = (a: number, b: number) => Math.round(a) !== Math.round(b)
</script>

<template>
  <span>
    <template v-if="moved(before.kcal, after.kcal)">
      <s class="text-dimmed"
        ><span class="sr-only">was </span>{{ Math.round(before.kcal) }}</s
      >
      {{ ' ' }}<span class="text-default">{{ Math.round(after.kcal) }}</span>
    </template>
    <template v-else>{{ Math.round(after.kcal) }}</template>
    kcal ·
    <template v-if="moved(before.protein, after.protein)">
      <s class="text-dimmed"
        ><span class="sr-only">was </span>{{ Math.round(before.protein) }}</s
      >
      {{ ' ' }}<span class="text-default">{{ Math.round(after.protein) }}</span>
    </template>
    <template v-else>{{ Math.round(after.protein) }}</template>
    g protein /100g
  </span>
</template>
