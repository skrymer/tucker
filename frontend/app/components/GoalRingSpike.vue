<script setup lang="ts">
// SPIKE (F12 throwaway) — a signature for the weight-only Today. DESIGN.md's
// thesis is "the day is a ring you close", but a User who logs nothing has no
// day to close. This transfers the ring to the thing they *do* close: the Goal.
// Same geometry as DayRing, one arc, brand green.
import type { components } from '#open-fetch-schemas/api'

const props = defineProps<{
  progress: components['schemas']['GoalProgressResponse']
  trendWeightKg: number | null | undefined
}>()

const R = 72
const CIRC = 2 * Math.PI * R

const percent = computed(() => Math.round(props.progress.percentComplete))
const kgToGo = computed(() => props.progress.kgToGo.toFixed(1))
const offset = computed(() => ringDashOffset(percent.value, 100, R))
const track = 'color-mix(in srgb, var(--ui-primary) 15%, transparent)'

const pace = computed(() =>
  props.progress.paceStatus ? paceBadge(props.progress.paceStatus) : null,
)
const trend = computed(() =>
  props.trendWeightKg != null ? `${props.trendWeightKg.toFixed(1)} kg` : '—',
)
</script>

<template>
  <UCard>
    <div class="flex flex-col items-center gap-6 sm:flex-row">
      <div class="relative size-40 shrink-0">
        <svg
          class="-rotate-90"
          width="160"
          height="160"
          viewBox="0 0 176 176"
          aria-hidden="true"
        >
          <circle
            cx="88"
            cy="88"
            r="72"
            fill="none"
            :stroke="track"
            stroke-width="15"
          />
          <circle
            cx="88"
            cy="88"
            r="72"
            fill="none"
            stroke="var(--ui-primary)"
            stroke-width="15"
            stroke-linecap="round"
            :stroke-dasharray="CIRC"
            :stroke-dashoffset="offset"
          />
        </svg>
        <div class="absolute inset-0 grid place-content-center text-center">
          <span
            class="font-display text-4xl font-extrabold tabular-nums text-highlighted"
          >
            {{ kgToGo }}
          </span>
          <span class="text-xs font-semibold text-muted">kg to go</span>
        </div>
      </div>

      <div class="flex w-full flex-col gap-4">
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm font-semibold text-default">Goal progress</span>
          <UBadge v-if="pace" :color="pace.color" variant="subtle" size="sm">
            {{ pace.label }}
          </UBadge>
        </div>
        <div>
          <p class="text-sm text-muted">{{ percent }}% complete</p>
          <UProgress
            class="mt-2"
            :model-value="percent"
            :max="100"
            color="primary"
            aria-label="Progress toward the goal weight"
          />
        </div>
        <div class="flex items-baseline justify-between gap-2">
          <span class="text-sm text-muted">Trend weight</span>
          <span class="font-display text-xl font-extrabold tabular-nums">
            {{ trend }}
          </span>
        </div>
      </div>
    </div>
  </UCard>
</template>
