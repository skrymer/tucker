<script setup lang="ts">
/**
 * `UInputNumber` with the one default every number field in Tucker wants.
 *
 * A number field re-reads its own display on every blur — typed into or not —
 * and left to itself snaps the result to `step`. But the step here only ever
 * says how far the arrows move; it is never the precision of what is being
 * entered. Snapping on top of it rounds a Provider's macro, a scale reading, or
 * a weighed gram to a figure nobody stated (issue #201).
 *
 * Reaching for this instead of `UInputNumber` is what keeps that true of the
 * next field somebody adds. The default is a default, not a law — an explicit
 * `step-snapping` at the call site still wins, because `$attrs` is bound after
 * it.
 *
 * Attributes and listeners pass straight through; no props are declared, so
 * `v-model` works exactly as it does on the field itself. Slots are not
 * forwarded, because no call site uses one.
 */
// Stryker disable next-line all: a compiler macro's arguments are hoisted out of setup()
defineOptions({ inheritAttrs: false })
</script>

<template>
  <UInputNumber :step-snapping="false" v-bind="$attrs" />
</template>
