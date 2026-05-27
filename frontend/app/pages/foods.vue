<script setup lang="ts">
const { data: foods, refresh } = await useApi('/api/foods')

const open = ref(false)
const submitting = ref(false)
const isDesktop = useIsDesktop()
const toast = useToast()
const { $api } = useNuxtApp()

async function handleSubmit(payload: {
  name: string
  proteinPer100g: number
  carbsPer100g: number
  fatPer100g: number
}) {
  if (submitting.value) return
  submitting.value = true
  try {
    await $api('/api/foods', { method: 'POST', body: payload })
    open.value = false
    await refresh()
    toast.add({ title: 'Food added', color: 'success' })
  } catch {
    toast.add({
      title: 'Could not add food',
      description: 'Check your connection and try again.',
      color: 'error',
    })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="flex flex-col gap-4">
    <header class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-default">Foods</h1>
      <UButton
        v-if="isDesktop"
        icon="i-lucide-plus"
        color="primary"
        @click="open = true"
      >
        Add food
      </UButton>
    </header>

    <FoodList v-if="foods && foods.length > 0" :foods="foods" />
    <FoodEmptyState v-else @add="open = true" />

    <UButton
      v-if="!isDesktop"
      icon="i-lucide-plus"
      color="primary"
      size="xl"
      aria-label="Add food"
      class="fixed right-4 bottom-20 size-14 rounded-full shadow-lg"
      :ui="{ base: 'justify-center' }"
      @click="open = true"
    />

    <AddFoodSheet v-model:open="open" @submit="handleSubmit" />
  </section>
</template>
