<script setup lang="ts">
import { z } from 'zod'
import type { components } from '#open-fetch-schemas/api'

type ProfileDto = components['schemas']['ProfileDto']

const sexItems = [
  { label: 'Male', value: 'MALE' },
  { label: 'Female', value: 'FEMALE' },
]

// Two named options rather than a switch: at setup, a toggle doesn't tell a new
// user that turning it off leaves a coherent app behind.
const trackingItems = [
  {
    label: 'Calories and weight',
    value: true,
    description:
      'Log what you eat against a calorie budget and a protein floor.',
  },
  {
    label: 'Weight only',
    value: false,
    description:
      'Weigh in and track your goal. Tucker never asks what you ate.',
  },
]

// The one statement of "a birth date is strictly in the past": the schema's
// backstop for an API-supplied value and the picker's bound are the same day.
const latestBirthDate = () => localYesterday()

const schema = z.object({
  sex: z.enum(['MALE', 'FEMALE'], { error: 'Choose your sex' }),
  birthDate: z
    .string()
    .min(1, 'Enter your birth date')
    .refine((d) => d <= latestBirthDate(), 'Birth date must be in the past'),
  heightCm: z
    .number({ error: 'Enter your height in cm' })
    .positive('Height must be greater than 0')
    .max(299.999, 'Height must be less than 300'),
  tracksCalories: z.boolean(),
})

type ProfileDetails = Pick<
  ProfileDto,
  'sex' | 'birthDate' | 'heightCm' | 'tracksCalories'
>

const props = defineProps<{
  // Partial, because a profile that predates a field is what the field's
  // default is for — an absent `tracksCalories` is a user who has never chosen.
  initial?: Partial<ProfileDetails>
}>()

const emit = defineEmits<{ submit: [ProfileDetails] }>()

const initialSex =
  props.initial?.sex === 'MALE' || props.initial?.sex === 'FEMALE'
    ? props.initial.sex
    : undefined

const state = reactive({
  sex: initialSex as 'MALE' | 'FEMALE' | undefined,
  birthDate: props.initial?.birthDate ?? '',
  heightCm: props.initial?.heightCm,
  tracksCalories: props.initial?.tracksCalories ?? DEFAULT_TRACKS_CALORIES,
})

function onSubmit() {
  emit('submit', {
    sex: state.sex!,
    birthDate: state.birthDate,
    heightCm: state.heightCm!,
    tracksCalories: state.tracksCalories,
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
      <DateField v-model="state.birthDate" :max="latestBirthDate()" />
    </UFormField>

    <UFormField label="Height (cm)" name="heightCm" required>
      <UInput v-model.number="state.heightCm" type="number" class="w-full" />
    </UFormField>

    <UFormField label="Calorie tracking" name="tracksCalories">
      <URadioGroup v-model="state.tracksCalories" :items="trackingItems" />
    </UFormField>

    <UButton type="submit" color="primary" class="w-full">Save profile</UButton>
  </UForm>
</template>
