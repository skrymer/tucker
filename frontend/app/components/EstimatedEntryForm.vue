<script setup lang="ts">
const props = defineProps<{ date: string }>()

const emit = defineEmits<{
  submit: [
    {
      date: string
      label: string
      calories: number
      protein?: number
    },
  ]
}>()

const state = reactive({
  label: '',
  calories: undefined as number | undefined,
  protein: undefined as number | undefined,
})

function onSubmit() {
  emit('submit', {
    date: props.date,
    label: state.label,
    calories: state.calories!,
    protein: state.protein,
  })
}
</script>

<template>
  <UForm :state="state" class="flex flex-col gap-4" @submit="onSubmit">
    <UFormField label="Label" name="label" required>
      <UInput
        v-model="state.label"
        placeholder="e.g. Lunch at restaurant"
        class="w-full"
      />
    </UFormField>

    <UFormField label="Calories" name="calories" required>
      <UInputNumber
        v-model="state.calories"
        :min="1"
        :step="1"
        class="w-full"
      />
    </UFormField>

    <UFormField label="Protein (optional)" name="protein">
      <UInputNumber v-model="state.protein" :min="0" :step="1" class="w-full" />
    </UFormField>

    <UButton type="submit" color="primary" class="w-full">
      Log estimated entry
    </UButton>
  </UForm>
</template>
