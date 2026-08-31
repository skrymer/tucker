<script setup lang="ts">
/**
 * What a **Reference Intake** obliges Tucker to state wherever one is read: the
 * source, the edition in force, its licence, and the body the figures assume
 * (CC BY 4.0, ADR 0027).
 *
 * The edition matters more here than a licence line usually does. A Reference
 * Intake is read **live** and never snapshotted, so a revision reaches windows
 * that predate it — without the edition named, a User has no way to see that the
 * line moved under a figure they were reading last week.
 *
 * Its own component rather than a paragraph in the card, because the obligation
 * attaches to the *figures*: it slots into `ReferenceFoodAttribution` so the two
 * sources share one footer, and any later surface that reads a Reference Intake
 * owes the same paragraph.
 */
</script>

<template>
  <p class="mt-2">
    Reference intakes from the Nutrient Reference Values for Australia and New
    Zealand (NHMRC, 2006, sodium revised 2017), used under
    <ULink
      to="https://creativecommons.org/licenses/by/4.0/"
      target="_blank"
      rel="noopener"
      class="underline"
    >
      CC BY 4.0
    </ULink>
    . Source: National Health and Medical Research Council. They are the figures
    for an adult who is not pregnant and not breastfeeding — both shift several
    of them substantially, and Tucker has no setting for either.
  </p>
</template>
