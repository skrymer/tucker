<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type GoalResponse = components['schemas']['GoalResponse']
type CurrentTrend = components['schemas']['WeightTrendResponse']

type GoalPayload = {
  startedOn: string
  targetWeightKg: number
  rateKgPerWeek: number
}

const props = defineProps<{
  goals: GoalResponse[]
  // The live Trend Weight the new Goal anchors its start on (ADR 0016); null until
  // a weight is logged, which also gates the form.
  currentTrend: CurrentTrend | null
  // A backend rejection of the target (the trend-weight rule, ADR 0016), shown
  // on the form's target field.
  targetError?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  submit: [GoalPayload]
}>()

const activeGoal = computed(() => props.goals.find((g) => g.active) ?? null)
const pastGoals = computed(() => props.goals.filter((g) => !g.active))

// The maintenance "since {date}" is the most recently reached Goal's reachedOn
// (ADR 0008); null for a user who has never reached one, so the status shows
// without a date. ISO date strings compare lexicographically.
const reachedSince = computed(() => {
  const reached = props.goals.filter((g) => g.reachedOn != null)
  if (reached.length === 0) return null
  return reached.reduce((latest, g) =>
    g.reachedOn! > latest.reachedOn! ? g : latest,
  ).reachedOn
})

const formOpen = ref(false)

// Close the replacement form on success, not optimistically on submit: success
// is signalled by the parent swapping in a new active Goal (a new id), whereas a
// rejected submit leaves the Goal unchanged so the form must stay open for its
// targetError to surface instead of vanishing silently.
watch(
  () => activeGoal.value?.id,
  (id, previous) => {
    if (id !== undefined && id !== previous) formOpen.value = false
  },
)

function handleSubmit(payload: GoalPayload) {
  emit('submit', payload)
}
</script>

<template>
  <section
    class="flex flex-col gap-3"
    aria-labelledby="goal-heading"
    :aria-disabled="props.disabled || undefined"
    :class="{ 'pointer-events-none opacity-50 select-none': props.disabled }"
  >
    <header class="flex items-center justify-between">
      <h2 id="goal-heading" class="text-lg font-semibold text-default">Goal</h2>
      <UButton
        v-if="!props.disabled && activeGoal && !formOpen"
        icon="i-lucide-target"
        color="primary"
        @click="formOpen = true"
      >
        Set a new goal
      </UButton>
    </header>

    <!-- Gated: a weight reading must exist before a goal can be set. -->
    <p v-if="props.disabled" class="text-sm text-muted">
      Log your weight first to set a goal.
    </p>

    <template v-else-if="!activeGoal">
      <!-- Maintenance Mode (ADR 0008): the durable status + re-entry. The Goal
           form is the same creation flow the reached banner's "Set a lower goal"
           lands on; it stays behind the CTA until the user chooses to re-enter. -->
      <MaintenanceStatus :since="reachedSince" @start-goal="formOpen = true" />
      <GoalForm
        v-if="formOpen && props.currentTrend"
        :current-trend="props.currentTrend"
        :target-error="props.targetError"
        @submit="handleSubmit"
      />
    </template>

    <template v-else>
      <GoalCard :goal="activeGoal" />

      <GoalForm
        v-if="formOpen && props.currentTrend"
        :current-trend="props.currentTrend"
        :target-error="props.targetError"
        @submit="handleSubmit"
      />

      <UCollapsible v-if="pastGoals.length > 0" class="flex flex-col gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          trailing-icon="i-lucide-chevron-down"
          class="justify-between"
          block
        >
          Past goals ({{ pastGoals.length }})
        </UButton>

        <template #content>
          <ul class="flex flex-col gap-2">
            <li v-for="goal in pastGoals" :key="goal.id">
              <GoalCard :goal="goal" />
            </li>
          </ul>
        </template>
      </UCollapsible>
    </template>
  </section>
</template>
