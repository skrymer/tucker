<script setup lang="ts">
// How long moving to each page takes: p75 per route, phone beside desktop on one
// scale, slowest first as the backend orders them (ADR 0038).
import { VisAxis, VisGroupedBar, VisTooltip, VisXYContainer } from '@unovis/vue'
import { GroupedBar } from '@unovis/ts'
import type { components } from '#open-fetch-schemas/api'

type RouteFigures = components['schemas']['RouteFiguresResponse']

const props = defineProps<{ routes: RouteFigures[] }>()

const { rows, x, y, color, tick, triggers } = useRouteTimingSeries(
  () => props.routes,
)

function useRouteTimingSeries(routes: () => RouteFigures[]) {
  // unovis draws index 0 at the foot of a horizontal chart, so the slowest,
  // first from the backend, goes last here to sit at the top.
  const rows = computed(() => [...routes()].reverse())
  const figuresOf = (r: RouteFigures, layout: string) =>
    r.layouts.find((l) => l.layout === layout)
  // A bar's index runs across every group, so its layout is its place within one.
  const layoutAt = (i: number) => LAYOUTS[i % LAYOUTS.length]!
  return {
    rows,
    x: (_: RouteFigures, i: number) => i,
    y: LAYOUTS.map(
      ({ layout }) =>
        (r: RouteFigures) =>
          figuresOf(r, layout)?.p75 ?? undefined,
    ),
    color: (_: RouteFigures, i: number) => layoutAt(i).color,
    tick: (i: number) => {
      const r = rows.value[i]
      return r ? routeLabel(r) : ''
    },
    triggers: {
      [GroupedBar.selectors.bar]: (r: RouteFigures, i: number) => {
        const { layout, name: layoutName } = layoutAt(i)
        const figures = figuresOf(r, layout)
        return figures
          ? `<strong>${r.route} · ${layoutName}</strong><br>${figuresLine(figures)}`
          : ''
      },
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
          <p class="text-sm text-muted">p75 per page, slowest first</p>
        </div>
        <ul aria-label="Layouts" class="flex gap-4 text-sm text-muted">
          <li
            v-for="{ layout, name: layoutName, color: swatch } in LAYOUTS"
            :key="layout"
            class="flex items-center gap-1.5"
          >
            <span
              class="inline-block size-2.5 rounded-full"
              :style="{ background: swatch }"
              aria-hidden="true"
            />
            {{ layoutName }}
          </li>
        </ul>
      </div>
      <div class="route-timing">
        <!-- `duration: 0`, as the Weight Timeline's: a d3 transition freezes
             part-way whenever the tab is not the focused window. -->
        <VisXYContainer
          :data="rows"
          :height="rows.length * 56"
          :duration="0"
          :margin="{ left: 4, right: 16 }"
        >
          <!-- No minimum length: a layout with too few samples has no bar,
               and a 1px stub would read as a very fast page. -->
          <VisGroupedBar
            :x="x"
            :y="y"
            :color="color"
            orientation="horizontal"
            :rounded-corners="4"
            :group-padding="0.3"
            :bar-padding="0.1"
            :bar-min-height="0"
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
    </div>
  </UCard>
</template>
