<script setup lang="ts">
// Where moving to each page spends its time (ADR 0038): a bar per route and
// layout, stacked server | network + proxy | render / JS, phone beside desktop
// on one scale, slowest first as the backend orders them.
import { VisAxis, VisStackedBar, VisTooltip, VisXYContainer } from '@unovis/vue'
import { StackedBar } from '@unovis/ts'
import type { components } from '#open-fetch-schemas/api'

type RouteFigures = components['schemas']['RouteFiguresResponse']

const props = defineProps<{ routes: RouteFigures[] }>()

const { rows, x, y, color, tick, triggers } = useRouteTimingSeries(
  () => props.routes,
)

function useRouteTimingSeries(routes: () => RouteFigures[]) {
  // unovis draws index 0 at the foot of a horizontal chart, so the top row,
  // first in reading order, goes last here.
  const rows = computed(() => timingRows(routes()).reverse())
  return {
    rows,
    x: (_: TimingRow, i: number) => i,
    // A row with too few samples has no split, so no bar at all.
    y: PARTS.map(
      ({ figure }) =>
        (r: TimingRow) =>
          r.figures[figure] ?? undefined,
    ),
    color: (_: TimingRow, part: number) => PARTS[part]!.color,
    tick: (i: number) => {
      const r = rows.value[i]
      return r ? rowLabel(r) : ''
    },
    // A stacked bar's part is bound to a record of its own, the row its `datum`.
    triggers: {
      [StackedBar.selectors.bar]: ({ datum: r }: { datum: TimingRow }) =>
        `<strong>${r.route} · ${r.layout.name}</strong><br>` +
        `${figuresLine(r.figures)}<br>${waitsLine(r.figures)}`,
    },
  }
}
</script>

<template>
  <UCard>
    <div class="flex flex-col gap-4">
      <div class="flex items-baseline justify-between gap-4">
        <div class="flex flex-col gap-1">
          <h2 class="text-h2 text-highlighted">Moving between pages</h2>
          <p class="text-sm text-muted">
            Where a move near the p75 spends its time, slowest page first
          </p>
        </div>
        <ul aria-label="Parts" class="flex gap-4 text-sm text-muted">
          <li
            v-for="{ name: partName, color: swatch } in PARTS"
            :key="partName"
            class="flex items-center gap-1.5"
          >
            <span
              class="inline-block size-2.5 rounded-full"
              :style="{ background: swatch }"
              aria-hidden="true"
            />
            {{ partName }}
          </li>
        </ul>
      </div>
      <div class="route-timing">
        <!-- `duration: 0`, as the Weight Timeline's: a d3 transition freezes
             part-way whenever the tab is not the focused window. -->
        <VisXYContainer
          :data="rows"
          :height="rows.length * 36"
          :duration="0"
          :margin="{ left: 4, right: 16 }"
        >
          <VisStackedBar
            :x="x"
            :y="y"
            :color="color"
            orientation="horizontal"
            :rounded-corners="4"
            :bar-padding="0.3"
          />
          <VisAxis
            type="y"
            :tick-format="tick"
            :tick-values="rows.map((_, i) => i)"
            :tick-line="false"
            :domain-line="false"
            :grid-line="false"
          />
          <VisAxis
            type="x"
            :tick-format="(ms: number) => `${ms} ms`"
            :num-ticks="5"
            :tick-line="false"
            :domain-line="false"
          />
          <VisTooltip :triggers="triggers" />
        </VisXYContainer>
      </div>
      <p class="text-sm text-muted">
        Server is Tucker working on the page's requests. Network + proxy is the
        rest of the wait for them: the trip through Cloudflare, the tunnel and
        the proxy. Render / JS is everything else: the phone or computer running
        the page's code and drawing it.
      </p>
    </div>
  </UCard>
</template>
