<script setup lang="ts">
const props = defineProps<{
  targetWeightKg: number
}>()

const emit = defineEmits<{ 'switch-to-maintenance': [] }>()

const target = computed(() => `${props.targetWeightKg.toFixed(1)} kg`)
</script>

<template>
  <UAlert
    icon="i-lucide-trophy"
    color="success"
    variant="subtle"
    :ui="{ icon: 'size-8' }"
  >
    <template #title>
      <h2 class="text-base font-semibold">You reached your goal!</h2>
    </template>
    <template #description>
      <p>
        Your trend weight has reached your target of {{ target }}. Choose how to
        continue.
      </p>
    </template>
    <template #actions>
      <UButton
        label="Switch to maintenance"
        color="success"
        variant="solid"
        size="md"
        block
        class="sm:w-auto"
        @click="emit('switch-to-maintenance')"
      />
      <UButton
        label="Set a lower goal"
        color="neutral"
        variant="outline"
        size="md"
        to="/profile"
        block
        class="sm:w-auto"
      />
    </template>
  </UAlert>
</template>
