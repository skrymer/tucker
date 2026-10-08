<script setup lang="ts">
// The Weight Timeline's chart: the trend, the readings and the plan, over the
// intake bars and the Budget. Decorative — every figure it encodes is stated in
// words by the section around it.
import {
  VisAxis,
  VisCrosshair,
  VisLine,
  VisScatter,
  VisStackedBar,
  VisXYContainer,
} from '@unovis/vue'
import type { components } from '#open-fetch-schemas/api'

const props = defineProps<{
  timeline: components['schemas']['WeightTimelineResponse']
  /** The intake half's scale, when the timeline has one. */
  scale: TimelineScale | null
  /** The Goal's plan, when the timeline draws one. */
  plan: TimelineTrajectory | null
}>()
const emit = defineEmits<{
  /** The day the pointer is on. */
  focus: [date: string]
}>()

// Whichever of the two exists, never a fallback between them: the wire cannot
// carry both halves, so at most one of these is non-null.
const kgDomain = computed(() => props.scale?.kgDomain ?? props.plan?.kgDomain)

const {
  at,
  trendKg,
  readingKg,
  dayTick,
  kgTick,
  intakeKg,
  intakeColor,
  budgetKg,
  trajectoryKg,
  clipKg,
} = weightTimelineSeries(
  () => props.timeline,
  () => props.scale,
  () => props.plan,
)

// Both arguments, not just the datum: unovis reports the nearest day even when
// the crosshair is *hidden* — the pointer being outside the plotted range, which
// the x-axis strip along the bottom of the card is — and passes `x` undefined to
// say so. Reading the datum alone names a day nothing on the chart is marking.
function focusOn(x?: number | Date, day?: TimelineDay) {
  if (x !== undefined && day) emit('focus', day.date)
}
</script>

<template>
  <!-- Decorative: every figure it encodes is listed below it, and a scatter
       of points under a line carries nothing a screen reader could use. -->
  <div aria-hidden="true" class="weight-timeline">
    <!-- `duration: 0` for the whole container: every animation here is a
         d3 transition, and a transition freezes part-way through whenever
         the tab is not the focused window — which leaves the crosshair at a
         few percent opacity and the chart half-drawn (the Intake Breakdown
         ring pays the same tax).

         The floor and ceiling carry room for the diamond marking where the
         plan runs off them: centred on a domain edge, half of it would
         otherwise sit in the date strip, and insetting the marker instead
         would part it from the line it terminates. -->
    <VisXYContainer
      :data="timeline.days"
      :height="200"
      :duration="0"
      :margin="{ top: 10, right: 4, bottom: 8, left: 4 }"
      :y-domain="kgDomain"
    >
      <!-- The intake half, drawn first so the weight reads over it. Every
           bar is stacked from zero, which sits far below the kilogram domain
           and so clips to the plot floor — and the series is kept out of the
           domain calculation, or that zero would flatten the trend. -->
      <VisStackedBar
        :x="at"
        :y="intakeKg"
        :color="intakeColor"
        :bar-padding="0.25"
        :rounded-corners="1"
        :exclude-from-domain-calculation="true"
      />
      <!-- What each bar is read against, and the only thing that gives one
           a meaning on its own: under the line or over it. -->
      <VisLine
        :x="at"
        :y="budgetKg"
        :color="BUDGET_COLOR"
        :curve-type="BUDGET_CURVE"
        :line-width="1"
        :line-dash-array="[3, 3]"
        :exclude-from-domain-calculation="true"
      />
      <!-- Where the Goal's plan says the trend should stand, beneath the
           trend itself: a reference is read against the body, not over it.
           Off the domain calculation like every overlay — the domain is the
           clamped one the plan was drawn into, not the one it would ask for. -->
      <VisLine
        :x="at"
        :y="trajectoryKg"
        :color="TRAJECTORY_COLOR"
        :curve-type="PLAN_CURVE"
        :line-width="1.5"
        :line-dash-array="[6, 4]"
        :exclude-from-domain-calculation="true"
      />
      <VisLine :x="at" :y="trendKg" :color="TREND_COLOR" />
      <VisScatter :x="at" :y="readingKg" :color="READING_COLOR" :size="5" />
      <!-- Where the plan runs off the plot. Drawn over everything, because it
           sits on the edge and is the one mark saying the line continues past
           it; a diamond rather than a triangle, unovis' pointing only up. -->
      <VisScatter
        :x="at"
        :y="clipKg"
        :color="TRAJECTORY_COLOR"
        shape="diamond"
        :size="CLIP_MARKER_PX"
        :exclude-from-domain-calculation="true"
      />
      <!-- Horizontal rules only, and none of unovis' default chrome: a
           kilogram grid is what a reading is measured against, where a
           vertical rule per date is a box drawn round the data. -->
      <VisAxis
        type="x"
        :tick-format="dayTick"
        :num-ticks="4"
        :grid-line="false"
        :tick-line="false"
        :domain-line="false"
      />
      <!-- Labelled at chosen values only once there are bars, the domain
           then reaching well below the readings: left to itself the axis
           would mark kilograms down among the bars that nobody ever weighed. -->
      <VisAxis
        type="y"
        :tick-format="kgTick"
        :tick-values="scale?.kgTicks"
        :num-ticks="4"
        :tick-line="false"
        :domain-line="false"
      />
      <!-- The callback is bound through an object rather than as an
           attribute, because VisCrosshair declares no props: every binding
           reaches it through `attrs` in the casing the template wrote, and a
           hyphenated key is one its config silently ignores — which is what
           `vue/attribute-hyphenation` would rewrite an attribute into.
           `duration` is its own rather than the container's for a second
           reason: a pointer move is a render the crosshair drives itself,
           and that one reads its own config, not the cascading one. -->
      <VisCrosshair
        :x="at"
        :y="trendKg"
        :color="TREND_COLOR"
        :duration="0"
        v-bind="{ onCrosshairMove: focusOn }"
      />
    </VisXYContainer>
  </div>
</template>
