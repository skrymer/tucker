<!--
  `kcal · g protein /100g` before → after: a figure whose rounded value moved
  reads as the old one struck through and dimmed, then the new one. The strike
  is announced as "was", so the pair reads as a change and not as two numbers.
-->
<script setup lang="ts">
// Stryker disable next-line all: a compiler macro must stay a top-level statement
const props = defineProps<{ before: Per100gFigures; after: Per100gFigures }>()

const figures = computed(() =>
  (['kcal', 'protein'] as const).map((key) => ({
    key,
    was: Math.round(props.before[key]),
    is: Math.round(props.after[key]),
    unit: key === 'kcal' ? 'kcal' : 'g protein',
  })),
)
</script>

<template>
  <span>
    <template v-for="(figure, at) in figures" :key="figure.key">
      <template v-if="at > 0">{{ ' · ' }}</template>
      <template v-if="figure.was !== figure.is">
        <del class="text-dimmed"
          ><span class="sr-only">was </span>{{ figure.was }}</del
        >{{ ' ' }}<span class="text-default">{{ figure.is }}</span>
      </template>
      <template v-else>{{ figure.is }}</template>
      {{ figure.unit }}
    </template>
    /100g
  </span>
</template>
