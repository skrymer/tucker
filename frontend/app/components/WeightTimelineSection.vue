<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'
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

/**
 * How the chart reads a day, and the two things it can be read against — the
 * intake half's scale, or the Goal's plan. Never both: the plan takes the intake
 * half's place rather than joining it (ADR 0029), so exactly one of them decides
 * the domain, and each is one object so a series and the axis it is placed
 * against cannot be derived apart.
 */
const scale = computed(() => weightTimelineScale(props.timeline))
const plan = computed(() => weightTimelineTrajectory(props.timeline))
// Whichever of the two exists, never a fallback between them: the wire cannot
// carry both halves, so at most one of these is non-null.
const kgDomain = computed(() => scale.value?.kgDomain ?? plan.value?.kgDomain)
/** Whether the plan runs past an edge of the plot, which changes what the key says. */
const planClipped = computed(() => (plan.value?.clips.length ?? 0) > 0)

/**
 * What to say when a plan is what this timeline draws and none of it is drawable.
 * Null whenever there is nothing to explain — the plan is on the chart, or there
 * is no plan because the User is in Maintenance Mode.
 *
 * Without it the two are the same card: every `trajectoryKg` is null either way,
 * and the key chip, the line and the readout all go with nothing saying why
 * (ADR 0029). `planStartsOn` is the response saying a plan is its evidence even
 * when no day carries one, which is what tells the states apart.
 */
const planPending = computed(() => {
  const evidence = props.timeline.evidence
  if (plan.value || evidence?.kind !== 'PLAN' || !evidence.planStartsOn) {
    return null
  }
  // Two silences, two sentences. A plan still ahead of the window has a date
  // worth naming; a plan that began *within* it has too few days to draw a line
  // through — the common case, since a Goal is always started today (ADR 0016)
  // and the window ends today. Dating that one prints today in the future tense.
  return evidence.planStartsOn > props.timeline.to
    ? `Your goal’s plan starts ${formatDayMonthFromISO(evidence.planStartsOn)}.`
    : 'Your goal’s plan appears here from tomorrow.'
})
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
  () => scale.value,
  () => plan.value,
)

/** Whether there is an intake half at all, which is Calorie Tracking's to decide. */
const tracksIntake = computed(() => timelineTracksIntake(props.timeline))

/** How far the bars can be trusted: how many of the days drawn carry an Entry. */
const coverage = computed(() => {
  const evidence = props.timeline.evidence
  if (evidence?.kind !== 'INTAKE' || evidence.loggedDays == null) return null
  return loggedDaysCaption(
    evidence.loggedDays,
    props.timeline.from,
    props.timeline.to,
  )
})

/** Each day in words — the chart is decorative, so this is what states it. */
const readouts = computed(() => weightTimelineReadouts(props.timeline))

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

      <div
        class="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted"
      >
        <!-- Which stroke is which, said in words: the chart's whole point is that
             a gliding line is not the same claim as the readings under it, and
             colour alone never carries an identity (frontend/DESIGN.md). -->
        <p class="flex flex-wrap items-center gap-x-4 gap-y-1">
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
          <!-- Only once there is a plan to name, which is Calorie Tracking off
               and a Goal running. One entry, whose swatch gains the diamond once
               the plan runs off the plot: a swatch must show everything the series
               draws, and two chips both opening with "Plan" would be the longest
               thing on a card that otherwise names three strokes in one word. -->
          <span v-if="plan" class="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              class="h-0.5 w-4 rounded-full border-t-2 border-dashed"
              :style="{ borderColor: TRAJECTORY_COLOR }"
            />
            <span
              v-if="planClipped"
              aria-hidden="true"
              class="-ml-1 size-1.5 rotate-45"
              :style="{ backgroundColor: TRAJECTORY_COLOR }"
            />
            {{ planClipped ? 'Plan off chart' : 'Plan' }}
          </span>
          <!-- Only once there are bars to name: with Calorie Tracking off the
             card is the weight half alone, and names the weight half alone. -->
          <template v-if="tracksIntake">
            <span class="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                class="h-2 w-1.5 rounded-xs"
                :style="{ backgroundColor: INTAKE_COLOR }"
              />
              Calories
            </span>
            <span class="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                class="h-0.5 w-4 rounded-full border-t-2 border-dashed"
                :style="{ borderColor: BUDGET_COLOR }"
              />
              Budget
            </span>
          </template>
        </p>

        <span v-if="coverage">{{ coverage }}</span>
        <!-- Said in the key's own row rather than over the chart: the chart is
             correct and simply has nothing of the plan to show yet, so this
             belongs beside the strokes it names and not as an error. -->
        <span v-if="planPending">{{ planPending }}</span>
      </div>

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
