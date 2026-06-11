<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

const props = defineProps<{
  progress: components['schemas']['GoalProgressResponse']
}>()

// The headline figures and the weight strip's three stops.
const useGoalReadout = () => {
  const percent = computed(() => Math.round(props.progress.percentComplete))
  const kg = (value: number) => `${value.toFixed(1)} kg`
  const stops = computed(() => [
    { label: 'Start', value: kg(props.progress.startWeightKg) },
    { label: 'Now', value: kg(props.progress.currentTrendKg) },
    { label: 'Target', value: kg(props.progress.targetWeightKg) },
  ])
  return { percent, stops }
}

// The planned projection, and the observed pace once the backend releases it.
const usePaceColumns = () => {
  const rate = (value: number) => `${value.toFixed(2)} kg/week`

  const planned = computed(() => ({
    finish: formatDateFromISO(props.progress.plannedFinishDate),
    rate: rate(props.progress.plannedRateKgPerWeek),
  }))

  // Withheld under two weeks of weigh-ins; otherwise the classified badge plus,
  // unless stalled, a projected finish date.
  const pace = computed(() => {
    const status = props.progress.paceStatus
    return status ? paceBadge(status as PaceStatus) : null
  })
  const observedFinish = computed(() =>
    props.progress.observedFinishDate
      ? formatDateFromISO(props.progress.observedFinishDate)
      : null,
  )
  const observedRate = computed(() =>
    props.progress.observedRateKgPerWeek != null
      ? rate(props.progress.observedRateKgPerWeek)
      : null,
  )

  return { planned, pace, observedFinish, observedRate }
}

const { percent, stops } = useGoalReadout()
const { planned, pace, observedFinish, observedRate } = usePaceColumns()
</script>

<template>
  <UCard>
    <div class="flex items-center justify-between gap-2">
      <h2 class="text-sm font-medium text-muted">Goal progress</h2>
      <UBadge v-if="pace" :color="pace.color" variant="subtle" size="sm">
        {{ pace.label }}
      </UBadge>
    </div>
    <p class="mt-1 text-4xl font-bold text-default">{{ percent }}%</p>
    <UProgress
      class="mt-3"
      :model-value="percent"
      :max="100"
      aria-label="Goal completion"
    />

    <!-- Start → now → target, all on the smoothed Trend Weight (ADR 0016): the
         start is the trend at creation, so a fresh Goal reads 0%. The caption says
         so, since these won't match a single morning's scale reading. -->
    <dl class="mt-6 grid grid-cols-3 gap-2 text-center">
      <div v-for="stop in stops" :key="stop.label">
        <dt class="text-xs font-medium text-muted">{{ stop.label }}</dt>
        <dd class="mt-1 text-lg font-semibold text-default">
          {{ stop.value }}
        </dd>
      </div>
    </dl>
    <p class="mt-2 text-center text-xs text-muted">
      Tracked on your smoothed trend weight
    </p>

    <!-- Planned vs observed finish — stacked on phone, two columns on desktop. -->
    <div class="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div class="border-t border-default pt-3">
        <p class="text-xs font-medium text-muted">Planned finish</p>
        <p class="mt-1 text-lg font-semibold text-default">
          {{ planned.finish }}
        </p>
        <p class="mt-1 text-sm text-muted">{{ planned.rate }}</p>
      </div>

      <div class="border-t border-default pt-3">
        <p class="text-xs font-medium text-muted">Observed finish</p>
        <template v-if="pace">
          <p
            v-if="observedFinish"
            class="mt-1 text-lg font-semibold text-default"
          >
            {{ observedFinish }}
          </p>
          <p v-else class="mt-1 text-lg font-semibold text-muted">—</p>
          <p v-if="observedRate" class="mt-1 text-sm text-muted">
            {{ observedRate }}
          </p>
        </template>
        <p v-else class="mt-1 text-sm text-muted">
          Pace available after 2 weeks of weigh-ins
        </p>
      </div>
    </div>
  </UCard>
</template>
