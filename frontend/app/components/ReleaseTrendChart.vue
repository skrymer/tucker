<script setup lang="ts">
// One route's small chart: releases along the x-axis, a line and its points per
// layout, on the y-scale the whole set shares. A release with no figure is a gap.
import {
  VisAxis,
  VisLine,
  VisScatter,
  VisTooltip,
  VisXYContainer,
} from '@unovis/vue'
// Straight, not unovis' default curve, which would draw p75s between releases
// that nobody measured.
import { CurveType, Scatter } from '@unovis/ts'
import type { components } from '#open-fetch-schemas/api'
import type { ReleasePoint, ReleaseSeries } from '~/utils/releaseTrend'

type RouteReleases = components['schemas']['RouteReleasesResponse']

const props = defineProps<{
  route: RouteReleases
  scaleMax: number
  series: ReleaseSeries[]
}>()

const MARGIN = { top: 8, right: 8 }
const x = (_: ReleasePoint, i: number) => i
const yOf = {
  phone: (d: ReleasePoint) => d.phone,
  desktop: (d: ReleasePoint) => d.desktop,
}
const msTick = (ms: number) => `${ms} ms`

const { data, ticks, xDomain, tick, triggers } = useReleaseSeries(
  () => props.route,
  () => props.series,
)

function useReleaseSeries(
  route: () => RouteReleases,
  series: () => ReleaseSeries[],
) {
  const data = computed(() => releasePoints(route()))
  // Either layout's point states the whole release, both layouts' figures.
  const pointLine = ({ release }: ReleasePoint) =>
    `<strong>${route().route} · ${release.version}</strong><br>` +
    series()
      .map(({ layout, label }) => `${label} ${figureIn(release, layout)}`)
      .join('<br>')
  return {
    data,
    ticks: computed(() => data.value.map((_, i) => i)),
    xDomain: computed(
      () => [-0.5, Math.max(data.value.length - 0.5, 0.5)] as [number, number],
    ),
    tick: (i: number) => data.value[i]?.release.version ?? '',
    triggers: { [Scatter.selectors.point]: pointLine },
  }
}
</script>

<template>
  <!-- Decorative: every figure it plots is in the table beside it. -->
  <div class="release-trend" aria-hidden="true">
    <!-- `duration: 0`, as the other charts': a d3 transition freezes part-way
         whenever the tab is not the focused window. -->
    <VisXYContainer
      :data="data"
      :height="140"
      :duration="0"
      :y-domain="[0, scaleMax]"
      :x-domain="xDomain"
      :margin="MARGIN"
    >
      <template v-for="s in series" :key="s.layout">
        <VisLine
          :x="x"
          :y="yOf[s.layout]"
          :color="s.color"
          :line-dash-array="s.dash"
          :curve-type="CurveType.Linear"
        />
        <VisScatter
          :x="x"
          :y="yOf[s.layout]"
          :color="s.color"
          :shape="s.shape"
          :size="8"
        />
      </template>
      <VisAxis
        type="x"
        :tick-format="tick"
        :tick-values="ticks"
        :tick-line="false"
        :grid-line="false"
      />
      <VisAxis
        type="y"
        :tick-format="msTick"
        :num-ticks="3"
        :tick-line="false"
        :domain-line="false"
      />
      <VisTooltip :triggers="triggers" />
    </VisXYContainer>
  </div>
</template>
