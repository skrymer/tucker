<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'
import {
  VisAxis,
  VisCrosshair,
  VisLine,
  VisScatter,
  VisXYContainer,
} from '@unovis/vue'
import type { components } from '#open-fetch-schemas/api'

const props = defineProps<{
  timeline: components['schemas']['WeightTimelineResponse']
  /** Whether a wider (or narrower) window is on its way. */
  pending?: boolean
}>()

/**
 * How wide a window is being asked about. Owned by the page, which turns it into
 * the request; the section only offers the choice.
 */
// Stryker disable next-line all: a compiler macro's arguments are hoisted out of setup()
const windowDays = defineModel<TimelineWindow>('windowDays', { default: 28 })

const windowItems: TabsItem[] = TIMELINE_WINDOWS.map((days) => ({
  label: `${days} days`,
  value: days,
}))

/** Both series on one kilogram scale, which the container shares between them. */
const { at, trendKg, readingKg, dayTick, kgTick } = weightTimelineSeries(
  () => props.timeline.days,
)

/** Each day in words — the chart is decorative, so this is what states it. */
const readouts = computed(() => weightTimelineReadouts(props.timeline.days))

/**
 * The day under the pointer, read out beneath the chart.
 *
 * Sticky on purpose: it holds the last day rather than clearing, so a tap on a
 * phone — which has no hover to leave — leaves something to read. Held as a
 * *date* and looked up again, so a window that no longer draws that day drops
 * the readout rather than naming one the chart has left behind.
 */
function useFocus() {
  const focusedDate = ref<string | null>(null)
  // Both arguments, not just the datum: unovis reports the nearest day even when
  // the crosshair is *hidden* — the pointer being outside the plotted range, which
  // the x-axis strip along the bottom of the card is — and passes `x` undefined to
  // say so. Reading the datum alone names a day nothing on the chart is marking.
  function focusOn(x?: number | Date, day?: TimelineDay) {
    if (x !== undefined && day) focusedDate.value = day.date
  }
  const readout = computed(
    () =>
      readouts.value.find((line) => line.date === focusedDate.value)?.text ??
      '',
  )
  return { focusOn, readout }
}
const { focusOn, readout } = useFocus()
</script>

<template>
  <UCard
    role="region"
    aria-labelledby="weight-timeline-heading"
    :aria-busy="pending"
  >
    <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <h2 id="weight-timeline-heading" class="text-sm font-medium text-muted">
        Your weight
      </h2>
      <SectionTabs v-model="windowDays" :items="windowItems" label="Window" />
    </div>

    <!-- Kept and dimmed while a wider window loads, the move and the reasoning
         IntakeBreakdownSection's own wrapper carries (ADR 0007). -->
    <div
      class="mt-3 transition-opacity delay-150"
      :class="pending && 'opacity-50'"
    >
      <!-- Decorative: every figure it encodes is listed below it, and a scatter
           of points under a line carries nothing a screen reader could use. -->
      <div aria-hidden="true" class="weight-timeline">
        <!-- `duration: 0` for the whole container: every animation here is a
             d3 transition, and a transition freezes part-way through whenever
             the tab is not the focused window — which leaves the crosshair at a
             few percent opacity and the chart half-drawn (the Intake Breakdown
             ring pays the same tax). -->
        <VisXYContainer
          :data="timeline.days"
          :height="200"
          :duration="0"
          :margin="{ top: 8, right: 4, bottom: 4, left: 4 }"
        >
          <VisLine :x="at" :y="trendKg" :color="TREND_COLOR" />
          <VisScatter :x="at" :y="readingKg" :color="READING_COLOR" :size="5" />
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
          <VisAxis
            type="y"
            :tick-format="kgTick"
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

      <!-- Which stroke is which, said in words: the chart's whole point is that a
           gliding line is not the same claim as the readings under it, and colour
           alone never carries an identity (frontend/DESIGN.md). -->
      <p
        class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted"
      >
        <span class="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            class="h-0.5 w-4 rounded-full"
            :style="{ backgroundColor: TREND_COLOR }"
          />
          Trend
        </span>
        <span class="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            class="size-1.5 rounded-full"
            :style="{ backgroundColor: READING_COLOR }"
          />
          Weigh-ins
        </span>
      </p>

      <!-- An `output`, the result of asking rather than another line of prose —
           but not a live region: the chart is `aria-hidden`, so only a pointer
           reaches this, and every line it can produce is in the list below.
           (frontend/DESIGN.md — the ring's readout is decorative for the same
           reason.) -->
      <output aria-live="off" class="block h-5 text-xs tabular-nums text-muted">
        {{ readout }}
      </output>

      <!-- Where the chart's figures are readable: one line per day, the same
           words the readout puts under the pointer. -->
      <ul class="sr-only">
        <li v-for="line in readouts" :key="line.date">{{ line.text }}</li>
      </ul>
    </div>
  </UCard>
</template>
