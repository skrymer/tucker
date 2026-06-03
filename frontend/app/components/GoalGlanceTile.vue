<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

const props = defineProps<{
  progress: components['schemas']['GoalProgressResponse'] | null | undefined
}>()

const percent = computed(() => Math.round(props.progress?.percentComplete ?? 0))
const kgToGo = computed(() => (props.progress?.kgToGo ?? 0).toFixed(1))

// The observed-pace badge is withheld until the backend has enough weigh-ins.
const pace = computed(() => {
  const status = props.progress?.paceStatus
  return status ? paceBadge(status as PaceStatus) : null
})
</script>

<template>
  <ULink v-if="progress" to="/review" class="block">
    <UCard>
      <div class="flex items-center justify-between gap-2">
        <p class="text-sm font-medium text-muted">Goal progress</p>
        <UBadge v-if="pace" :color="pace.color" variant="subtle" size="sm">
          {{ pace.label }}
        </UBadge>
      </div>
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
