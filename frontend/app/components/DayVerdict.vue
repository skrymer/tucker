<script setup lang="ts">
// The earned day verdict as word, icon and colour — never colour alone. Renders
// nothing for an in-progress or pre-review day, which has no verdict.
const props = defineProps<{ status: DayStatus | null | undefined }>()

const verdict = computed(() => dayStatusVerdict(props.status))
</script>

<template>
  <p
    v-if="verdict"
    :class="['flex items-center gap-2 text-sm font-medium', verdict.class]"
  >
    <UIcon :name="verdict.icon" class="size-4" aria-hidden />
    {{ verdict.label }}
  </p>
</template>
