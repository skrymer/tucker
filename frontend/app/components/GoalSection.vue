<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type GoalResponse = components['schemas']['GoalResponse']
type CurrentTrend = components['schemas']['WeightTrendResponse']

const props = defineProps<{
  goals: GoalResponse[]
  // The live Trend Weight a Goal anchors its start on (ADR 0016); null until a
  // weight is logged, which also gates the form.
  currentTrend: CurrentTrend | null
  // The backend's refusal of a submit, by what it is about: the target (the
  // trend-weight rule, ADR 0016) and the rate (it outruns Maintenance, ADR 0030)
  // on their fields, and one naming no field above the form's submit.
  refusal?: GoalRefusal
  pending?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  submit: [GoalPayload]
}>()

const activeGoal = computed(() => props.goals.find((g) => g.active) ?? null)
const pastGoals = computed(() => props.goals.filter((g) => !g.active))

// With no reading, an active Goal still shows; only setting one waits on a weight.
const gated = computed(() => props.disabled && !activeGoal.value)

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
// rejected submit leaves the Goal unchanged so the form must stay open for the
// refusal to surface instead of vanishing silently.
watch(
  () => activeGoal.value?.id,
  (id, previous) => {
    if (id !== undefined && id !== previous) formOpen.value = false
  },
)
</script>

<template>
  <ContentCard
    subject="goal"
    title="Goal"
    :aria-disabled="gated || undefined"
    :class="{ 'pointer-events-none opacity-50 select-none': gated }"
  >
    <template #trailing>
      <UButton
        v-if="!gated && !props.disabled && !formOpen"
        icon="i-lucide-target"
        color="primary"
        @click="
          () => {
            formOpen = true
          }
        "
      >
        {{ activeGoal ? 'Set a new goal' : 'Start a goal' }}
      </UButton>
    </template>

    <!-- Gated: a weight reading must exist before a goal can be set. -->
    <p v-if="gated" class="text-sm text-muted">
      Log your weight first, on <ULink to="/" class="underline">Today</ULink>,
      to set a goal.
    </p>

    <div v-else class="flex flex-col gap-3">
      <!-- Maintenance Mode is the absence of an active Goal (ADR 0008): the
           Goal's band stands over it, and the body says the User is
           maintaining. The form is the same creation flow the reached
           banner's "Set a lower goal" lands on, behind the band's action. -->
      <div v-if="!activeGoal">
        <p class="text-body text-default">
          You're maintaining<span v-if="reachedSince" class="text-muted"
            >&nbsp;since {{ formatDateFromISO(reachedSince) }}</span
          >.
        </p>
        <p class="mt-1 text-sm text-muted">
          No active goal — your budget holds at maintenance. Ready to cut again?
        </p>
      </div>
      <GoalCard v-else :goal="activeGoal" />

      <p v-if="props.disabled" class="text-sm text-muted">
        Log your weight first, on <ULink to="/" class="underline">Today</ULink>,
        to set a new goal.
      </p>

      <GoalForm
        v-if="formOpen && props.currentTrend"
        :current-trend="props.currentTrend"
        :refusal="props.refusal"
        :pending="props.pending"
        @submit="emit('submit', $event)"
      />

      <UCollapsible
        v-if="activeGoal && pastGoals.length > 0"
        class="flex flex-col gap-2"
      >
        <UButton
          color="neutral"
          variant="ghost"
          trailing-icon="i-lucide-chevron-down"
          class="justify-between"
          block
        >
          Past goals ({{ pastGoals.length }})
        </UButton>

        <!-- Rows, not a card each: cards never nest (DESIGN.md → Content card). -->
        <template #content>
          <ul class="divide-y divide-default">
            <li v-for="goal in pastGoals" :key="goal.id" class="py-3">
              <GoalCard :goal="goal" />
            </li>
          </ul>
        </template>
      </UCollapsible>
    </div>
  </ContentCard>
</template>
