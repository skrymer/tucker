<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type GoalResponse = components['schemas']['GoalResponse']
type LatestWeight = components['schemas']['WeightMeasurementResponse']

type GoalPayload = {
  startedOn: string
  startWeightKg: number
  targetWeightKg: number
  rateKgPerWeek: number
}

const props = defineProps<{
  goals: GoalResponse[]
  latestWeight: LatestWeight | null
}>()

const emit = defineEmits<{
  submit: [GoalPayload]
}>()

const activeGoal = computed(() => props.goals.find((g) => g.active) ?? null)
const pastGoals = computed(() => props.goals.filter((g) => !g.active))

const formOpen = ref(false)

function handleSubmit(payload: GoalPayload) {
  formOpen.value = false
  emit('submit', payload)
}
</script>

<template>
  <section class="flex flex-col gap-3" aria-labelledby="goal-heading">
    <header class="flex items-center justify-between">
      <h2 id="goal-heading" class="text-lg font-semibold text-default">Goal</h2>
      <UButton
        v-if="activeGoal && !formOpen"
        icon="i-lucide-target"
        color="primary"
        @click="formOpen = true"
      >
        Set a new goal
      </UButton>
    </header>

    <template v-if="!activeGoal">
      <GoalForm
        v-if="props.latestWeight"
        :latest-weight="props.latestWeight"
        @submit="handleSubmit"
      />
      <p v-else class="text-sm text-muted">Log a weight first to set a goal.</p>
    </template>

    <template v-else>
      <GoalCard :goal="activeGoal" />

      <GoalForm
        v-if="formOpen && props.latestWeight"
        :latest-weight="props.latestWeight"
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
