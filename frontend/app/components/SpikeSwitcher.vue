<script setup lang="ts">
// SPIKE (F12 throwaway) — flips the prototype variants in the browser so the
// weight-only shapes can be compared without an edit-and-reload. Deleted with
// the branch.
const { tracksCalories, signature } = useSpike()

const trackingItems = [
  { label: 'Calories and weight', value: true },
  { label: 'Weight only', value: false },
]
const signatureItems = [
  { label: 'A · none', value: 'none' },
  { label: 'B · goal ring', value: 'ring' },
  { label: 'C · trend', value: 'trend' },
]
</script>

<template>
  <div
    class="mb-4 flex flex-col gap-2 rounded-[1.25rem] border border-dashed border-warning/60 bg-warning/5 p-3"
  >
    <p
      class="text-[11.5px] font-semibold tracking-[0.06em] text-warning uppercase"
    >
      F12 prototype — not shipping
    </p>
    <div class="flex flex-wrap items-center gap-2">
      <span class="w-24 text-sm text-muted">Tracking</span>
      <UButton
        v-for="item in trackingItems"
        :key="String(item.value)"
        size="xs"
        :color="tracksCalories === item.value ? 'primary' : 'neutral'"
        :variant="tracksCalories === item.value ? 'solid' : 'outline'"
        @click="tracksCalories = item.value"
      >
        {{ item.label }}
      </UButton>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <span class="w-24 text-sm text-muted">Signature</span>
      <UButton
        v-for="item in signatureItems"
        :key="item.value"
        size="xs"
        :color="signature === item.value ? 'primary' : 'neutral'"
        :variant="signature === item.value ? 'solid' : 'outline'"
        @click="signature = item.value as SpikeSignature"
      >
        {{ item.label }}
      </UButton>
    </div>
  </div>
</template>
