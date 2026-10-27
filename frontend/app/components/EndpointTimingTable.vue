<script setup lang="ts">
import type { ServerEndpoint } from '~/utils/serverFigures'

const props = defineProps<{ endpoints: ServerEndpoint[] }>()

const LEGEND = Object.entries(DUMBBELL_MARKS).map(([label, mark]) => ({
  label,
  ...mark,
}))
const count = (n: number) => n.toLocaleString('en-AU')

const STEPS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]

/** The smallest round step that reaches [max] ms in five steps or fewer. */
const axisStep = (max: number) =>
  STEPS.find((step) => Math.ceil(max / step) <= 5) ??
  Math.ceil(max / 5 / 10000) * 10000

/** One linear ms axis for every row, its top a whole step, at most six labels. */
const axis = computed(() => {
  const max = Math.max(1, ...props.endpoints.map((e) => e.p95Ms ?? 0))
  const step = axisStep(max)
  const top = Math.ceil(max / step) * step
  return {
    top,
    ticks: Array.from({ length: top / step + 1 }, (_, i) => i * step),
  }
})

/** A tick label sits right of zero, left of the top, and centred between. */
function tickPlacement(tick: number) {
  if (tick === 0) return ''
  return tick === axis.value.top ? '-translate-x-full' : '-translate-x-1/2'
}

const timed = (e: ServerEndpoint) => e.p50Ms != null && e.p95Ms != null
const tooltip = (e: ServerEndpoint) =>
  `p50 ${e.p50Ms} ms → p95 ${e.p95Ms} ms · ${count(e.count)} requests · ${e.serverErrors} answered 5xx`
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-baseline justify-between gap-4">
      <h3 id="endpoints-heading" class="text-label text-default">
        Request time by endpoint, p50 to p95
      </h3>
      <ul
        v-if="endpoints.length"
        aria-label="Percentiles"
        class="flex gap-4 text-sm text-muted"
      >
        <li
          v-for="mark in LEGEND"
          :key="mark.label"
          class="flex items-center gap-1.5"
        >
          <svg viewBox="0 0 12 12" class="size-3" aria-hidden="true">
            <circle
              cx="6"
              cy="6"
              :r="mark.r"
              :fill="mark.fill"
              :stroke="mark.stroke"
              stroke-width="2"
            />
          </svg>
          {{ mark.label }}
        </li>
      </ul>
    </div>

    <div
      v-if="!endpoints.length"
      class="flex items-center gap-2 rounded-inset bg-elevated/50 px-4 py-3 text-sm text-muted"
    >
      <UIcon name="i-lucide-inbox" class="size-4" aria-hidden="true" />
      No requests since the restart
    </div>
    <table
      v-else
      aria-labelledby="endpoints-heading"
      class="w-full table-fixed"
    >
      <thead>
        <tr class="text-xs text-muted">
          <th scope="col" class="w-72 text-left font-normal">Endpoint</th>
          <th scope="col" class="relative h-4 font-normal">
            <span class="sr-only">p50 to p95</span>
            <span aria-hidden="true">
              <span
                v-for="t in axis.ticks"
                :key="t"
                class="absolute top-0 whitespace-nowrap tabular-nums"
                :class="tickPlacement(t)"
                :style="{ left: `${(t / axis.top) * 100}%` }"
              >
                {{ t }} ms
              </span>
            </span>
          </th>
          <th scope="col" class="w-24 text-right font-normal">Requests</th>
          <th scope="col" class="w-16 text-right font-normal">5xx</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="e in endpoints"
          :key="`${e.method} ${e.uri}`"
          class="text-sm"
        >
          <td class="truncate py-1.5">
            <span class="inline-block w-14 text-xs font-semibold text-muted">
              {{ e.method }}
            </span>
            {{ ' ' }}
            <span class="text-default">{{ e.uri }}</span>
          </td>
          <td v-if="!timed(e)" class="text-dimmed">too few</td>
          <td v-else>
            <UTooltip :text="tooltip(e)">
              <span tabindex="0" class="block h-7">
                <EndpointDumbbell
                  :p50-ms="e.p50Ms!"
                  :p95-ms="e.p95Ms!"
                  :ticks="axis.ticks"
                  :top="axis.top"
                />
                <span class="sr-only">
                  p50 {{ e.p50Ms }} ms, p95 {{ e.p95Ms }} ms
                </span>
              </span>
            </UTooltip>
          </td>
          <td class="text-right text-default tabular-nums">
            {{ count(e.count) }}
          </td>
          <td class="text-right tabular-nums">
            <span
              v-if="e.serverErrors"
              class="inline-flex items-center gap-1 font-semibold text-error"
            >
              <UIcon
                name="i-lucide-triangle-alert"
                class="size-3.5"
                aria-hidden="true"
              />
              {{ e.serverErrors }}
            </span>
            <span v-else class="text-dimmed">0</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
