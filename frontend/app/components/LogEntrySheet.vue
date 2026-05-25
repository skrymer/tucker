<script setup lang="ts">
defineProps<{ date: string }>()

const emit = defineEmits<{ logged: [] }>()

const open = ref(false)
const submitting = ref(false)
const isDesktop = useIsDesktop()
const toast = useToast()
const { $api } = useNuxtApp()

async function handleSubmitEstimated(payload: {
  date: string
  label: string
  calories: number
  protein?: number
}) {
  if (submitting.value) return
  submitting.value = true
  try {
    await $api('/api/entries/estimated', {
      method: 'POST',
      body: payload,
    })
    open.value = false
    emit('logged')
  } catch {
    toast.add({
      title: 'Could not save entry',
      description: 'Check your connection and try again.',
      color: 'error',
    })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UButton color="primary" icon="i-lucide-plus" block @click="open = true">
    Log entry
  </UButton>

  <UDrawer
    v-if="!isDesktop"
    v-model:open="open"
    direction="bottom"
    title="Log entry"
    :dismissible="!submitting"
  >
    <template #body>
      <LogEntryBody :date="date" @submit-estimated="handleSubmitEstimated" />
    </template>
  </UDrawer>

  <UModal
    v-else
    v-model:open="open"
    title="Log entry"
    :dismissible="!submitting"
  >
    <template #body>
      <LogEntryBody :date="date" @submit-estimated="handleSubmitEstimated" />
    </template>
  </UModal>
</template>
