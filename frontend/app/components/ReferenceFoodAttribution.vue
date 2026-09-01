<script setup lang="ts">
/**
 * What AFCD's licence obliges Tucker to carry wherever its figures are read:
 * the source and the edition, a link to the agreement, the Limitation of Data
 * Statement verbatim, and the Australian-data notice (CC BY-SA 3.0 AU,
 * ADR 0027).
 *
 * Its own component because the obligation attaches to the *figures*, not to one
 * card — `V16__seed_reference_food.sql` names this file as where they live, and
 * every later surface that reads a micronutrient owes the same paragraph.
 */
</script>

<template>
  <footer class="mt-4 border-t border-default pt-3 text-xs text-dimmed">
    <p>
      Based on the Australian Food Composition Database (Release 3), Food
      Standards Australia New Zealand, used under
      <ULink
        to="https://www.foodstandards.gov.au/science-data/monitoringnutrients/afcd/datauserlicenceagreement"
        target="_blank"
        rel="noopener"
        class="underline"
      >
        the CC BY-SA 3.0 AU data user licence
      </ULink>
      .
    </p>
    <!-- `unmount-on-hide` off: the Limitation of Data Statement and the
         Australian-data notice are licence terms that must accompany the data,
         so they stay in the page whether or not anybody opens this. -->
    <UCollapsible class="mt-1" :unmount-on-hide="false">
      <UButton
        label="About this data"
        trailing-icon="i-lucide-chevron-down"
        color="neutral"
        variant="link"
        size="xs"
        class="min-h-11 p-0"
        :ui="{
          trailingIcon:
            'group-data-[state=open]:rotate-180 transition-transform',
        }"
      />
      <template #content>
        <p class="mt-1">
          There are limitations associated with food composition databases. Food
          composition data used in the database or databases may represent an
          average of the nutrient content of a particular sample of foods and
          ingredients, determined at a particular time. The nutrient composition
          of foods and ingredients can vary substantially between batches and
          brands because of a number of factors, including changes in season,
          processing practices and ingredient source, and methods of
          calculation.
        </p>
        <p class="mt-2">
          The Work is based on Australian data and Australia data may not be
          appropriate for use in other countries.
        </p>
      </template>
    </UCollapsible>
    <!-- Any second source read on the same surface goes here, so the two share
         one footer rather than stacking two bordered ones. -->
    <slot />
  </footer>
</template>
