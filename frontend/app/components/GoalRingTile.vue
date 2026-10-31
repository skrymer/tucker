<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

const props = defineProps<{
  progress: components['schemas']['GoalProgressResponse']
}>()

// The arc the ring draws — one, at the shared outer radius, so the two rings are
// peers by construction (DESIGN.md).
function useGoalArc() {
  const percent = computed(() =>
    Math.round(props.progress.percentComplete ?? 0),
  )
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

/**
 * The legend beside it: the centre figure and the two weights it is measured
 * between — or, with no reading to make a trend of, only the target.
 */
function useGoalReadout() {
  const tracked = computed(() => props.progress.currentTrendKg != null)
  const kgToGo = computed(() => (props.progress.kgToGo ?? 0).toFixed(1))
  const trend = computed(
    () => `${(props.progress.currentTrendKg ?? 0).toFixed(1)} kg`,
  )
  const target = computed(
    () => `${props.progress.targetWeightKg.toFixed(1)} kg`,
  )
  return { tracked, kgToGo, trend, target }
}

const { percent, arcs } = useGoalArc()
const { tracked, kgToGo, trend, target } = useGoalReadout()
</script>

<template>
  <!-- The card's own name, so assistive tech announces a link rather than
       reading every figure on it as the link's label. -->
  <ULink
    to="/review"
    class="block"
    aria-label="Goal progress — open your weekly review"
  >
    <ContentCard subject="goal" title="Goal">
      <div class="flex flex-col items-center gap-6 sm:flex-row">
        <RingGauge :arcs="arcs">
          <template v-if="tracked">
            <span class="text-ring-figure tabular-nums text-highlighted">
              {{ kgToGo }}
            </span>
            <span class="text-label text-muted">kg to go</span>
          </template>
        </RingGauge>

        <div class="flex w-full flex-col gap-4">
          <!-- The band names the Goal, so the legend leads with the figure:
               the swatch keys it to the arc, the pace badge sits beside it. -->
          <div class="flex flex-wrap items-center gap-2">
            <span class="size-2.5 shrink-0 rounded bg-primary" />
            <p v-if="tracked" class="text-sm text-muted">
              {{ percent }}% complete
            </p>
            <p v-else class="text-sm text-muted">
              Log a weight to see where you stand on your Goal.
            </p>
            <PaceBadge :pace-status="progress.paceStatus" />
          </div>

          <div class="border-t border-default pt-3">
            <p v-if="tracked" class="text-sm text-muted">
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
    </ContentCard>
  </ULink>
</template>
