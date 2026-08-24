<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

const props = defineProps<{
  progress: components['schemas']['GoalProgressResponse']
}>()

// The arc the ring draws — one, at the Day Ring's own radius, so RingGauge makes
// the two peers by construction (DESIGN.md).
function useGoalArc() {
  const percent = computed(() => Math.round(props.progress.percentComplete))
  const arcs = computed(() => [
    {
      radius: 72,
      stroke: 'var(--ui-primary)',
      consumed: percent.value,
      target: 100,
    },
  ])
  return { percent, arcs }
}

// The legend beside it: the centre figure, the two weights it is measured
// between, and the observed pace — withheld until the backend has enough
// readings to classify one.
function useGoalReadout() {
  const kgToGo = computed(() => props.progress.kgToGo.toFixed(1))
  const trend = computed(() => `${props.progress.currentTrendKg.toFixed(1)} kg`)
  const target = computed(
    () => `${props.progress.targetWeightKg.toFixed(1)} kg`,
  )
  const pace = computed(() => paceBadge(props.progress.paceStatus))
  return { kgToGo, trend, target, pace }
}

const { percent, arcs } = useGoalArc()
const { kgToGo, trend, target, pace } = useGoalReadout()
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
          <span
            class="font-display text-4xl font-extrabold tabular-nums text-highlighted"
          >
            {{ kgToGo }}
          </span>
          <span class="text-xs font-semibold text-muted">kg to go</span>
        </RingGauge>

        <div class="flex w-full flex-col gap-4">
          <div>
            <div class="mb-1 flex items-center gap-2">
              <span class="size-2.5 rounded bg-primary" />
              <h2 class="text-sm font-semibold text-default">Goal progress</h2>
              <UBadge
                v-if="pace"
                :color="pace.color"
                variant="subtle"
                size="sm"
              >
                {{ pace.label }}
              </UBadge>
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
