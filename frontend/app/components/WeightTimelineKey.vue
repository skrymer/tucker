<script setup lang="ts">
// The Weight Timeline's key: which stroke is which, said in words.
// Stryker disable next-line all: a compiler macro must stay a top-level statement
defineProps<{
  /** Whether a plan is drawn. */
  plan: boolean
  /** Whether the plan runs past an edge of the plot. */
  planClipped: boolean
  /** Whether there are intake bars, which is Calorie Tracking's to decide. */
  tracksIntake: boolean
}>()
</script>

<template>
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
</template>
