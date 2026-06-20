<script setup lang="ts">
import { z } from 'zod'
import type { components } from '#open-fetch-schemas/api'

type FoodResponse = components['schemas']['FoodResponse']

const props = defineProps<{
  food: FoodResponse | null
  /** The log mutation's in-flight flag — shows on the submit (ADR 0007). */
  pending?: boolean
}>()

const emit = defineEmits<{
  log: [{ foodId: number; grams: number }]
  close: []
}>()

// Autofocus the grams field on desktop for quick entry, but NOT on phone: there
// the focus pops the on-screen keyboard the instant the drawer opens, which
// covers the controls and blocks swipe-to-dismiss, making the sheet hard to
// dismiss (the corner close button stays the reliable exit).
const isDesktop = useIsDesktop()

const schema = z.object({ grams: gramsSchema })

const state = reactive({ grams: undefined as number | undefined })

// Reset on every (re)open so a previous session's grams don't linger.
watch(
  () => props.food,
  (food) => {
    if (food) state.grams = undefined
  },
)

function onSubmit() {
  emit('log', { foodId: props.food!.id, grams: state.grams! })
}
</script>

<template>
  <ResponsiveOverlay
    :open="food !== null"
    :title="`Log ${food?.name}`"
    @update:open="(value) => !value && emit('close')"
  >
    <!-- Keyed per food so each open mounts a fresh form — UInputNumber keeps
         its rendered text when the model resets to undefined. -->
    <UForm
      :key="food?.id"
      :state="state"
      :schema="schema"
      class="flex flex-col gap-4"
      @submit="onSubmit"
    >
      <UFormField label="Weight (g)" name="grams" required>
        <UInputNumber
          v-model="state.grams"
          :autofocus="isDesktop"
          :step="1"
          placeholder="e.g. 150"
          class="w-full"
        />
      </UFormField>

      <UButton type="submit" color="primary" :loading="pending" class="w-full">
        Log entry
      </UButton>
    </UForm>
  </ResponsiveOverlay>
</template>
