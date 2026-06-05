<script setup lang="ts">
const props = defineProps<{
  // The date the most recent Goal was reached (ISO), absent for a user who has
  // never reached one — the status then shows without a "since" date (ADR 0008).
  since?: string | null
}>()

const emit = defineEmits<{ 'start-goal': [] }>()

const sinceLabel = computed(() =>
  props.since ? `since ${formatDateFromISO(props.since)}` : null,
)
</script>

<template>
  <UCard>
    <div class="flex items-start gap-3">
      <span
        class="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
      >
        <UIcon name="i-lucide-leaf" class="size-5" />
      </span>
      <div class="min-w-0">
        <h2 class="text-sm font-medium text-default">
          You're maintaining<span v-if="sinceLabel" class="text-muted"
            >&nbsp;{{ sinceLabel }}</span
          >.
        </h2>
        <p class="mt-1 text-sm text-muted">
          No active goal — your budget holds at maintenance. Ready to cut again?
        </p>
      </div>
    </div>

    <UButton
      icon="i-lucide-target"
      color="primary"
      size="lg"
      block
      class="mt-4 sm:w-auto"
      @click="emit('start-goal')"
    >
      Start a goal
    </UButton>
  </UCard>
</template>
