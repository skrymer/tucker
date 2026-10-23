<script setup lang="ts">
// Whether a release made a page faster or slower (ADR 0038): one small chart per
// route, releases along the x-axis in release order, a phone line and a desktop
// line, every chart on one y-scale.
import type { components } from '#open-fetch-schemas/api'
import type { ReleaseSeries } from '~/utils/releaseTrend'

type RouteReleases = components['schemas']['RouteReleasesResponse']

const props = defineProps<{ routes: RouteReleases[] }>()

const scaleMax = computed(() => sharedScaleMax(props.routes))
const layoutsOf = (route: RouteReleases) =>
  route.releases.flatMap((release) => release.layouts)
// A p75 of 0 ms is still a figure.
const hasFigure = computed(() =>
  props.routes.some((r) => layoutsOf(r).some((l) => l.p75 != null)),
)

/**
 * Each layout's line. Desktop is dashed, with square points, so the two never
 * rest on colour alone — its amber sits under 3:1 on the light card.
 */
const SERIES: ReleaseSeries[] = [
  {
    layout: 'phone',
    label: LAYOUT_NAMES.phone,
    color: 'var(--tucker-cat-7)',
    dash: undefined,
    shape: 'circle',
  },
  {
    layout: 'desktop',
    label: LAYOUT_NAMES.desktop,
    color: 'var(--tucker-cat-4)',
    dash: [4, 3],
    shape: 'square',
  },
]
</script>

<template>
  <UCard>
    <div class="flex flex-col gap-4">
      <div class="flex items-baseline justify-between gap-4">
        <div class="flex flex-col gap-1">
          <h2 class="text-h2 text-highlighted">p75 per release</h2>
          <p class="text-sm text-muted">
            Each page's p75 move, release by release, on one scale
          </p>
        </div>
        <ul aria-label="Layouts" class="flex gap-4 text-sm text-muted">
          <li
            v-for="s in SERIES"
            :key="s.layout"
            class="flex items-center gap-1.5"
          >
            <svg width="16" height="2" aria-hidden="true">
              <line
                x1="0"
                y1="1"
                x2="16"
                y2="1"
                stroke-width="2"
                :stroke="s.color"
                :stroke-dasharray="s.dash?.join(' ')"
              />
            </svg>
            {{ s.label }}
          </li>
        </ul>
      </div>
      <p v-if="!hasFigure" class="text-body text-muted">
        No release has a p75 yet: a layout needs five moves in a release for
        one.
      </p>
      <!-- With nothing to chart, the counts are still read out. -->
      <div
        class="grid grid-cols-2 gap-6 xl:grid-cols-3"
        :class="!hasFigure && 'sr-only'"
      >
        <section v-for="r in routes" :key="r.route">
          <h3 class="text-label text-default">{{ r.route }}</h3>
          <ReleaseTrendChart
            v-if="hasFigure"
            :route="r"
            :scale-max="scaleMax"
            :series="SERIES"
          />
          <table class="sr-only">
            <caption>
              {{
                r.route
              }}
            </caption>
            <thead>
              <tr>
                <th scope="col">Release</th>
                <th v-for="s in SERIES" :key="s.layout" scope="col">
                  {{ s.label }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="rel in r.releases" :key="rel.version">
                <th scope="row">{{ rel.version }}</th>
                <td v-for="s in SERIES" :key="s.layout">
                  {{ figureIn(rel, s.layout) }}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
      <p class="text-sm text-muted">
        The app version filter doesn't apply here: releases are these charts'
        axis.
      </p>
    </div>
  </UCard>
</template>
