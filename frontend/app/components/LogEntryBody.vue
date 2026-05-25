<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'

defineProps<{ date: string }>()

const emit = defineEmits<{
  submitEstimated: [
    {
      date: string
      label: string
      calories: number
      protein?: number
    },
  ]
}>()

const items: TabsItem[] = [
  { value: 'estimated', label: 'Estimated', slot: 'estimated' },
  { value: 'weighed', label: 'Weighed', slot: 'weighed' },
]
</script>

<template>
  <UTabs
    :items="items"
    default-value="estimated"
    color="primary"
    class="w-full"
  >
    <template #estimated>
      <EstimatedEntryForm
        :date="date"
        class="mt-4"
        @submit="(payload) => emit('submitEstimated', payload)"
      />
    </template>

    <template #weighed>
      <div
        class="mt-4 flex flex-col items-center gap-2 py-8 text-center text-muted"
      >
        <UIcon name="i-lucide-scale" class="size-8" aria-hidden />
        <p class="text-sm">
          Weighed entries — coming soon. Weigh your food and pick it from the
          Foods list.
        </p>
      </div>
    </template>
  </UTabs>
</template>
