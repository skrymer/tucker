<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type FoodResponse = components['schemas']['FoodResponse']

defineProps<{ food: FoodResponse | null }>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()
</script>

<template>
  <UModal
    :open="food !== null"
    title="Delete this food?"
    @update:open="(value) => !value && emit('cancel')"
  >
    <template #body>
      <p class="text-sm text-default">
        <span class="font-medium">{{ food?.name }}</span> will be removed from
        your catalog. Entries you've already logged keep their numbers.
      </p>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" @click="emit('cancel')">Cancel</UButton>
        <UButton color="error" @click="emit('confirm')">Delete</UButton>
      </div>
    </template>
  </UModal>
</template>
