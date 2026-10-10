<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

const props = defineProps<{
  progress: components['schemas']['GoalProgressResponse']
}>()

// The arc the ring draws — one, at the shared outer radius, so the two rings are
// peers by construction (DESIGN.md).
function useGoalArc() {
  const percent = computed(() => Math.round(props.progress.percentComplete))
  const arcs = computed(() => [
    {
      radius: RING_RADIUS_OUTER,
      stroke: 'var(--ui-primary)',
      consumed: percent.value,
      target: 100,
    },
  ])
  return { percent, arcs }
}

// The legend beside it: the centre figure and the two weights it is measured
// between.
function useGoalReadout() {
  const kgToGo = computed(() => props.progress.kgToGo.toFixed(1))
  const trend = computed(() => `${props.progress.currentTrendKg.toFixed(1)} kg`)
  const target = computed(
    () => `${props.progress.targetWeightKg.toFixed(1)} kg`,
  )
  return { kgToGo, trend, target }
}

const { percent, arcs } = useGoalArc()
const { kgToGo, trend, target } = useGoalReadout()
</script>

<template>
  <!-- The card's own name, so assistive tech announces a link rather than
       reading every figure on it as the link's label. -->
  <ULink
    to="/review"
    class="block"
    aria-label="Goal progress — open your weekly review"
  >
    <UCard>
      <div class="flex flex-col items-center gap-6 sm:flex-row">
        <RingGauge :arcs="arcs">
          <span class="text-ring-figure tabular-nums text-highlighted">
            {{ kgToGo }}
          </span>
          <span class="text-label text-muted">kg to go</span>
        </RingGauge>

        <div class="flex w-full flex-col gap-4">
          <div>
            <div class="mb-1 flex items-center gap-2">
              <span class="size-2.5 rounded bg-primary" />
              <GoalProgressHeading :pace-status="progress.paceStatus" />
            </div>
            <p class="text-sm text-muted">{{ percent }}% complete</p>
          </div>

          <div class="border-t border-default pt-3">
            <p class="text-sm text-muted">
              Trend weight
              <span class="font-semibold tabular-nums text-default">
                {{ trend }}
              </span>
            </p>
            <p class="mt-1 text-sm text-muted">
              Target
              <span class="font-semibold tabular-nums text-default">
                {{ target }}
              </span>
            </p>
          </div>
        </div>
      </div>
    </UCard>
  </ULink>
</template>
