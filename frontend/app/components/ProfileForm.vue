<script setup lang="ts">
import { z } from 'zod'

const sexItems = [
  { label: 'Male', value: 'MALE' },
  { label: 'Female', value: 'FEMALE' },
]

const today = () => new Date().toLocaleDateString('en-CA')

const schema = z.object({
  sex: z.enum(['MALE', 'FEMALE'], { error: 'Choose your sex' }),
  birthDate: z
    .string()
    .min(1, 'Enter your birth date')
    .refine((d) => d < today(), 'Birth date must be in the past'),
  heightCm: z
    .number({ error: 'Enter your height in cm' })
    .positive('Height must be greater than 0')
    .max(299.999, 'Height must be less than 300'),
})

const props = defineProps<{
  initial?: { sex: string; birthDate: string; heightCm: number }
}>()

const emit = defineEmits<{
  submit: [{ sex: string; birthDate: string; heightCm: number }]
}>()

const initialSex =
  props.initial?.sex === 'MALE' || props.initial?.sex === 'FEMALE'
    ? props.initial.sex
    : undefined

const state = reactive({
  sex: initialSex as 'MALE' | 'FEMALE' | undefined,
  birthDate: props.initial?.birthDate ?? '',
  heightCm: props.initial?.heightCm,
})

function onSubmit() {
  emit('submit', {
    sex: state.sex!,
    birthDate: state.birthDate,
    heightCm: state.heightCm!,
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
    <UFormField label="Sex" name="sex" required>
      <URadioGroup v-model="state.sex" :items="sexItems" />
    </UFormField>

    <UFormField label="Birth date" name="birthDate" required>
      <UInput v-model="state.birthDate" type="date" class="w-full" />
    </UFormField>

    <UFormField label="Height (cm)" name="heightCm" required>
      <UInput v-model.number="state.heightCm" type="number" class="w-full" />
    </UFormField>

    <UButton type="submit" color="primary" class="w-full">Save profile</UButton>
  </UForm>
</template>
