<script setup lang="ts">
import { z } from 'zod'

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

const schema = z.object({
  label: z.string().min(1, 'Enter a label for this entry'),
  calories: z.number({ error: 'Enter an estimated calorie figure' }),
  protein: z.number().optional(),
})

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
  <UForm
    :state="state"
    :schema="schema"
    class="flex flex-col gap-4"
    @submit="onSubmit"
  >
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
