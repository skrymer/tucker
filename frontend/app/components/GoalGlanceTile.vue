<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

const props = defineProps<{
  progress: components['schemas']['GoalProgressResponse'] | null | undefined
}>()

const percent = computed(() => Math.round(props.progress?.percentComplete ?? 0))
const kgToGo = computed(() => (props.progress?.kgToGo ?? 0).toFixed(1))
</script>

<template>
  <ULink v-if="progress" to="/review" class="block">
    <UCard>
      <p class="text-sm font-medium text-muted">Goal progress</p>
      <p class="mt-1 text-4xl font-bold text-default">{{ percent }}%</p>
      <p class="mt-1 text-sm text-muted">{{ kgToGo }} kg to go</p>
    </UCard>
  </ULink>

  <ULink v-else to="/profile" class="block">
    <UCard>
      <p class="font-medium text-default">Set a goal</p>
      <p class="mt-1 text-sm text-muted">
        Set a weight-loss goal to start tracking your progress.
      </p>
    </UCard>
  </ULink>
</template>
